import json
import logging
import os
from collections.abc import Sequence

import networkx as nx
from networkx import Graph
from sqlalchemy import create_engine, inspect
from sqlalchemy import text as sql_text
from sqlalchemy.engine import Engine, Inspector
from sqlalchemy.engine.reflection import Inspector

from core.utils.decorators import requires
from core.utils.exceptions import MissingRequiredAttributeError
from core.utils.types import ColumnMetadata, ForeignKeyRef, TableMetadata


class DatabaseManager:
    def __init__(
        self,
        host: str = "",
        user: str = "",
        port: str = "",
        name: str = "",
        password: str = "",
    ):
        self.host = host
        self.user = user
        self.port = port
        self.name = name
        self.password = password

    def to_dict(self) -> dict:
        return {
            "host": self.host,
            "user": self.user,
            "port": self.port,
            "name": self.name,
            "connected": self.connected,
        }

    def setup_logging(self, log_path: str = "sqlalchemy.log"):
        logger = logging.getLogger("sqlalchemy.engine")
        logger.setLevel(logging.INFO)
        logger.propagate = False  # Prevent console spam

        file_handler = logging.FileHandler(log_path, mode="w")
        file_handler.setLevel(logging.INFO)
        formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
        file_handler.setFormatter(formatter)

        logger.addHandler(file_handler)

    def read_logs(
        self, log_path: str = "sqlalchemy.log", lines: int = 100
    ) -> list[str]:
        if not os.path.exists(log_path):
            return []

        with open(log_path, "r") as f:
            logs = f.readlines()[-lines:]

        return [log.strip() for log in logs]

    def clear_logs(self, log_path: str = "sqlalchemy.log"):
        if os.path.exists(log_path):
            with open(log_path, "w") as f:
                f.write("")

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

    @property
    def connected(self) -> bool:
        return getattr(self, "_connected", False)

    def create_url(self, engine: str = "mysql") -> str:
        if engine == "mysql":
            self._url = f"mysql+pymysql://{self.user}:{self.password}@{self.host}:{self.port}/{self.name}"
        else:
            raise Exception(f"Unsupported engine: {engine}")
        return self._url

    def clear_url(self):
        self._url = ""
        self._connected = False

        if hasattr(self, "_engine"):
            del self._engine

    @requires("host", "user", "port", "name", "password")
    def save(self, path: str):
        creds = {
            "db_host": self.host,
            "db_user": self.user,
            "db_port": self.port,
            "db_password": self.password,
            "db_name": self.name,
        }
        with open(path, "w") as f:
            json.dump(creds, f, indent=4)

    def load(self, path: str, fail_silently: bool = True):
        if os.path.exists(path):
            with open(path, "r") as f:
                creds = json.load(f)
                self.host = creds.get("db_host", "")
                self.user = creds.get("db_user", "")
                self.port = creds.get("db_port", "")
                self.password = creds.get("db_password", "")
                self.name = creds.get("db_name", "")
        else:
            if not fail_silently:
                raise FileNotFoundError(f"Credentials file '{path}' not found.")

    @requires("url")
    def create_engine(self) -> Engine:
        self.setup_logging()
        self._engine = create_engine(self._url, echo=False)
        return self._engine

    @requires("engine")
    def test_connection(self) -> bool:
        with self._engine.connect() as connection:
            connection.execute(sql_text("SELECT 1"))
            self._connected = True
        return self._connected

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
    def get_existing_values(self, table: str, column: str):
        values = set()
        with self.engine.connect() as conn:
            result = conn.execute(
                sql_text(
                    f"SELECT `{column}` FROM `{table}` WHERE `{column}` IS NOT NULL"
                )
            )
            values = set(row[0] for row in result)
        return values

    @requires("engine")
    def run_sql(self, sql: str) -> bool:
        try:
            with self.engine.begin() as conn:
                result = conn.execute(sql_text(sql))
                logging.info(f"Executed SQL: {sql}")

                if result.returns_rows:
                    for row in result:
                        logging.info(row._mapping)
                else:
                    logging.info(f"Rows affected: {result.rowcount}")

            return True
        except Exception as e:
            logging.error(f"Error executing SQL: {e}")
            raise e
