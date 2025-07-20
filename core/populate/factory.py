import ast
from dataclasses import dataclass
import json
import logging
import math
from numbers import Number
import os
from collections.abc import Sequence
from pathlib import Path
import random
import re
from typing import Any, Callable

from faker import Faker
import faker
import networkx as nx
from networkx import Graph
import rstr
from sqlalchemy import create_engine, inspect
from sqlalchemy import text as sql_text
from sqlalchemy.engine import Engine, Inspector
from sqlalchemy.engine.reflection import Inspector

from core.helpers import cap_string, cap_numeric
from core.populate.config import DBFRegistry
from core.settings import DB_PATH, LOG_PATH
from core.utils.decorators import requires
from core.utils.exceptions import MissingRequiredAttributeError, VerificationError
from core.utils.types import GeneratorType as GType
from core.utils.types import (
    ColumnMetadata,
    ColumnSpec,
    DbCredsSchema,
    ForeignKeyRef,
    TableMetadata,
)


class DatabaseFactory:
    def __init__(self):
        self.id = None
        self.host = ""
        self.user = ""
        self.port = ""
        self.name = ""
        self.password = ""
        self.registry = DBFRegistry()

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "host": self.host,
            "user": self.user,
            "port": self.port,
            "name": self.name,
        }

    def from_dict(self, data: dict):
        for key in ["host", "user", "port", "name", "password"]:
            if key not in data:
                raise ValueError(f"Missing required key: {key}")
            setattr(self, key, str(data[key]))

    def to_schema(self) -> DbCredsSchema:
        return DbCredsSchema(
            id=self.id,
            name=self.name,
            host=self.host,
            port=self.port,
            user=self.user,
            password=self.password,
        )

    def from_schema(self, schema: DbCredsSchema) -> None:
        for key in ["host", "user", "port", "name", "password"]:
            if not hasattr(schema, key):
                raise ValueError(f"Missing required key: {key}")
            setattr(self, key, str(getattr(schema, key, None)))

    @property
    def url(self) -> str:
        if not hasattr(self, "_url"):
            raise MissingRequiredAttributeError(
                "URL has not been created. Call 'create_url' first."
            )
        return self._url

    @property
    def engine(self) -> Engine:
        if not hasattr(self, "_engine"):
            raise MissingRequiredAttributeError(
                "Engine is not initialized. Call 'create_engine' first."
            )
        return self._engine

    @property
    def inspector(self) -> Inspector:
        return inspect(self._engine)

    def setup_logging(self):
        logger = logging.getLogger("sqlalchemy")
        logger.setLevel(logging.INFO)
        logger.propagate = False

        logger.handlers.clear()
        log_path = Path(os.path.join(LOG_PATH, f"{self.name}.sql.log"))
        log_path.parent.mkdir(parents=True, exist_ok=True)

        file_handler = logging.FileHandler(log_path, mode="a")
        file_handler.setLevel(logging.INFO)
        formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
        file_handler.setFormatter(formatter)

        logger.addHandler(file_handler)

        for sub in ["sqlalchemy.engine", "sqlalchemy.pool", "sqlalchemy.dialects"]:
            sub_logger = logging.getLogger(sub)
            sub_logger.setLevel(logging.INFO)
            sub_logger.propagate = False
            sub_logger.handlers.clear()
            sub_logger.addHandler(file_handler)

    def read_logs(self, lines: int = 100) -> list[str]:
        log_file = os.path.join(LOG_PATH, f"{self.name}.sql.log")
        if not os.path.exists(log_file):
            return []

        with open(log_file, "r") as f:
            logs = f.readlines()[-lines:]

        return [log.strip() for log in logs]

    def clear_logs(self):
        log_file = os.path.join(LOG_PATH, f"{self.name}.sql.log")
        if os.path.exists(log_file):
            with open(log_file, "w") as f:
                f.write("")

    def create_url(self, engine: str = "mysql") -> str:
        if engine == "mysql":
            self._url = f"mysql+pymysql://{self.user}:{self.password}@{self.host}:{self.port}/{self.name}"
        else:
            raise Exception(f"Unsupported engine: {engine}")
        return self._url

    @requires("host", "user", "port", "name", "password")
    def save(self):
        pk = self.registry.save_cred(
            DbCredsSchema(
                name=self.name,
                host=self.host,
                port=self.port,
                password=self.password,
                user=self.user,
            )
        )
        self.id = pk

    def load(self, name: str, host: str, port: str, user: str) -> bool:
        creds = self.registry.load_cred(name=name, host=host, port=port, user=user)
        if creds:
            self.id = creds.id
            self.host = creds.host
            self.user = creds.user
            self.port = creds.port
            self.password = creds.password
            self.name = creds.name
            return True
        else:
            return False

    @requires("host", "user", "port", "name", "password")
    def connect(self) -> bool:
        self.create_url()
        self.create_engine()
        self.test_connection()
        return True

    @requires("url")
    def create_engine(self) -> Engine:
        self.setup_logging()
        self._engine = create_engine(self._url, echo=False)
        return self._engine

    @requires("engine")
    def test_connection(self) -> bool:
        with self._engine.connect() as connection:
            connection.execute(sql_text("SELECT 1"))
        return True

    @requires("engine")
    def get_columns(self, table_name: str) -> list:
        """
        Returns the columns of a table.
        """
        return self.inspector.get_columns(table_name)

    @requires("engine")
    def get_tables(self) -> dict:
        tables = self.inspector.get_table_names()
        table_info = {table: {"parents": 0, "rows": 0} for table in tables}

        for table in table_info:
            fks = self.inspector.get_foreign_keys(table)
            parents = {fk["referred_table"] for fk in fks if fk.get("referred_table")}
            table_info[table]["parents"] = len(parents)

            with self.engine.connect() as conn:
                result = conn.execute(sql_text(f"SELECT COUNT(*) FROM {table}"))
                table_info[table]["rows"] = result.scalar_one()

        return table_info

    @requires("engine")
    def sort_tables(self, tables: list[str] | None = None) -> list[str]:
        """
        Sorts the tables based on their foreign key dependencies.
        """

        graph = self.get_dependency_graph(tables or self.inspector.get_table_names())
        for src, tgt in graph.edges():
            score = self.score_edge(src, tgt)
            graph[src][tgt]["score"] = score

        while True:
            try:
                cycles = nx.find_cycle(graph)
            except nx.NetworkXNoCycle:
                break

            min_edge = min(cycles, key=lambda edge: graph[edge[0]][edge[1]]["score"])
            graph.remove_edge(min_edge[0], min_edge[1])

        sorted_tables = list(nx.topological_sort(graph))
        return sorted_tables

    @requires("engine")
    def score_edge(self, source: str, target: str) -> int | float:
        fks = self.inspector.get_foreign_keys(target)
        columns = self.inspector.get_columns(target)

        for fk in fks:
            if fk.get("referred_table") != source:
                continue
            for col in columns:
                if col["name"] in fk.get("constrained_columns", []):
                    nullable = col.get("nullable")
                    default = col.get("default") is not None
                    if nullable and default:
                        return 0
                    elif nullable:
                        return 1
                    elif default:
                        return 2

        return float("inf")

    @requires("engine")
    def get_dependency_graph(self, tables: list[str]) -> Graph:
        graph = nx.DiGraph()
        for table in tables:
            for fk in self.inspector.get_foreign_keys(table):
                referred = fk.get("referred_table")
                if referred and referred in tables:
                    graph.add_edge(referred, table)
            graph.add_node(table)
        return graph

    @requires("engine")
    def get_table_metadata(self, table_name: str) -> TableMetadata:
        if table_name not in self.inspector.get_table_names():
            raise ValueError(f"Table '{table_name}' does not exist in the database.")

        fk_map = self.get_foreign_keys(table_name)
        pk = self.inspector.get_pk_constraint(table_name).get("constrained_columns", [])
        cols = self.inspector.get_columns(table_name)
        s, m = self.get_unique_columns(table_name)

        def handle_default(default_val):
            if default_val is None:
                return None
            if hasattr(default_val, "arg"):
                return str(default_val.arg)
            return default_val

        columns = []
        for col in cols:
            name = col["name"]
            dtype = col["type"]
            multi_unique = next((i for i, t in enumerate(m) if name in t), None)

            column_metadata = ColumnMetadata(
                name=name,
                type=str(dtype),
                primary_key=name in pk,
                nullable=col.get("nullable", True),
                unique=s is not None and name in s,
                multi_unique=m[multi_unique] if multi_unique is not None else None,
                default=handle_default(col.get("default")),
                autoincrement=bool(col.get("autoincrement")),
                computed=bool(col.get("computed")),
                foreign_keys=fk_map.get(name, ForeignKeyRef(table="", column="")),
                length=getattr(dtype, "length", None),
                precision=getattr(dtype, "precision", None),
                scale=getattr(dtype, "scale", None),
            )
            columns.append(column_metadata)

        return TableMetadata(
            name=table_name,
            parents=list(set(t.table for t in fk_map.values())),
            columns=columns,
        )

    @requires("engine")
    def get_unique_columns(self, table: str) -> tuple[list[str], list[tuple[str, ...]]]:
        s_unique_cols = set()
        m_unique_cols = set()

        def add_unique(cols: Sequence[str | None] | None):
            if cols:
                if len(cols) == 1:
                    s_unique_cols.add(cols[0])
                else:
                    m_unique_cols.add(tuple(sorted(c for c in cols if c is not None)))

        # Add UNIQUE constraints
        for uc in self.inspector.get_unique_constraints(table):
            add_unique(uc.get("column_names"))

        # Add UNIQUE indexes
        for idx in self.inspector.get_indexes(table):
            if idx.get("unique"):
                add_unique(idx.get("column_names"))

        # Add PRIMARY KEY constraint
        pk = self.inspector.get_pk_constraint(table)
        add_unique(pk.get("constrained_columns"))

        return list(s_unique_cols), list(m_unique_cols)

    @requires("engine")
    def get_foreign_keys(self, table: str) -> dict[str, ForeignKeyRef]:
        fk_map = {}

        for fk in self.inspector.get_foreign_keys(table):
            ref_tbl = fk.get("referred_table")
            ref_cols = fk.get("referred_columns", [])
            local_cols = fk.get("constrained_columns", [])

            for src, dest in zip(local_cols, ref_cols):
                fk_map[src] = ForeignKeyRef(
                    column=dest,
                    table=ref_tbl,
                )

        return fk_map

    @requires("engine")
    def get_existing_values(self, table: str, column: str) -> list[str]:
        with self.engine.connect() as conn:
            result = conn.execute(
                sql_text(
                    f"SELECT `{column}` FROM `{table}` WHERE `{column}` IS NOT NULL"
                )
            )
            values = [row[0] for row in result]
        return values

    @requires("engine")
    def run_sql(self, sql: str) -> list[dict] | int:
        try:
            with self.engine.begin() as conn:
                result = conn.execute(sql_text(sql))
                logging.info(f"Executed SQL: {sql}")

                if result.returns_rows:
                    rows = [dict(row._mapping) for row in result]
                    logging.info(f"Returned {len(rows)} rows.")
                    return rows
                else:
                    logging.info(f"Rows affected: {result.rowcount}")
                    return result.rowcount  # or just True if you prefer

        except Exception as e:
            logging.error(f"Error executing SQL: {e}")
            raise e


@dataclass
class ContextFactory:
    dbf: DatabaseFactory
    table: TableMetadata
    col_spec: ColumnSpec
    n: int
    entries: dict[str, list[str]] | None = None

    @property
    def column(self) -> ColumnMetadata:
        if self.table is None or self.col_spec is None:
            raise ValueError("Table or column specification is missing.")
        return self.table.get_column(self.col_spec.name)

    @property
    def cache(self) -> dict[str, Any]:
        if not hasattr(self, "_cache"):
            self._cache = {}
        return self._cache


class GeneratorFactory:
    def __init__(self) -> None:
        self.faker = Faker()

    def make(self, type: GType, context: ContextFactory) -> list[str]:
        make_fn = getattr(self, f"make_{type.value}", None)
        if make_fn is None or not callable(make_fn):
            raise ValueError(f"Unknown generator type: {type}")
        return make_fn(context)  # type: ignore

    def make_faker(self, context: ContextFactory) -> list[str]:
        assert context.col_spec.generator, "Faker generator is not specified."
        faker_fn = getattr(self.faker, context.col_spec.generator)
        return self._sample_values(context.n, faker_fn, context.column)

    def make_python(self, context: ContextFactory) -> list[str]:
        if not context.col_spec.generator:
            return []

        assert context.entries
        try:
            tree = ast.parse(context.col_spec.generator)

            # Prepare the environment for execution
            env = {
                "faker": faker,
                "columns": {},
                "order": lambda x: (lambda f: f),
                "__builtins__": __builtins__,
            }
            exec(compile(tree, filename="<ast>", mode="exec"), env)

            # Call the generator function
            gen = env["generator"]
            col = context.column

            rows = []
            for idx in range(context.n):
                columns = {key: context.entries[key][idx] for key in context.entries}
                val = gen(columns=columns)

                if isinstance(val, str):
                    val = cap_string(val, col.length)
                elif isinstance(val, Number):
                    val = cap_numeric(val, col.precision, col.scale)  # type: ignore

                rows.append(str(val))
            return rows

        except SyntaxError as e:
            raise VerificationError(f"Syntax Error in Python script: {e}")

    def make_regex(self, context: ContextFactory) -> list[str]:
        regex_fn = lambda: rstr.xeger(context.col_spec.generator or "")
        return self._sample_values(context.n, regex_fn, context.column)

    def make_foreign(self, context: ContextFactory) -> list[str]:
        column = context.column
        fk = column.foreign_keys
        cache = context.cache
        dbf = context.dbf

        if not fk:
            raise ValueError(f"No foreign key reference for column {column.name}")

        if not f"{fk.table}.{fk.column}" in cache:
            cache[f"{fk.table}.{fk.column}"] = dbf.get_existing_values(
                fk.table, fk.column
            )

        rows = cache[f"{fk.table}.{fk.column}"]

        return [random.choice(rows) for _ in range(context.n)]

    def make_autoincrement(self, context: ContextFactory) -> list[str]:
        existing = context.dbf.get_existing_values(
            context.table.name, context.column.name
        )
        max_val = max((v for v in existing if isinstance(v, int)), default=0)

        return [f"{max_val + i + 1} [auto]" for i in range(context.n)]

    def make_computed(self, context: ContextFactory) -> list[str]:
        return ["[expr]" for _ in range(context.n)]

    def _sample_values(
        self, n: int, gen_fn: Callable, col: ColumnMetadata
    ) -> list[str]:
        overshoot = math.ceil(n * 1.5)
        rows = []
        for _ in range(overshoot):
            val = gen_fn()

            if isinstance(val, str):
                val = cap_string(val, col.length)
            elif isinstance(val, Number):
                val = cap_numeric(val, col.precision, col.scale)  # type: ignore

            rows.append(str(val))

        return list(rows)

    def check(self, type: GType, generator: str) -> bool | int:
        make_fn = getattr(self, f"check_{type.value}", None)
        if make_fn is None or not callable(make_fn):
            raise ValueError(f"Unknown check type: {type}")
        return make_fn(generator)  # type: ignore

    def check_faker(self, generator: str):
        if not callable(getattr(self.faker, generator, None)):
            raise VerificationError(
                f"Faker method '{generator}' is not callable or doesn't exist."
            )
        return True

    def check_python(self, generator: str) -> int:
        try:
            tree = ast.parse(generator)

            for node in tree.body:
                if isinstance(node, ast.FunctionDef) and node.name == "generator":
                    if len(node.args.args) != 1 or (node.args.args[0].arg != "columns"):
                        raise ValueError(
                            "generator() must take exactly 1 arg: 'columns'."
                        )
                    for deco in node.decorator_list:
                        if (
                            isinstance(deco, ast.Call)
                            and getattr(deco.func, "id", "") == "order"
                        ):
                            if isinstance(deco.args[0], ast.Constant) and isinstance(
                                deco.args[0].value, int
                            ):
                                return deco.args[0].value
                            raise ValueError("@order requires int type arg")
                    raise ValueError("Missing @order(int) decorator")
            raise ValueError("No valid generator() function found")
        except SyntaxError as e:
            raise ValueError(f"Syntax Error: {e}")

    def check_regex(self, generator: str):
        # This will raise an error if the regex is invalid
        re.compile(generator)
        return True

    def check_foreign(self, generator: str):
        return True

    def check_autoincrement(self, generator: str):
        return True

    def check_computed(self, generator: str):
        return True
