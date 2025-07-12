from collections.abc import Sequence
import contextlib
import os
import re
from faker import Faker
from pydantic import BaseModel, model_validator, root_validator
from sqlalchemy.engine import Engine, Inspector
from sqlalchemy import create_engine
from sqlalchemy import text as sql_text
from sqlalchemy.engine.interfaces import ReflectedForeignKeyConstraint
import networkx as nx
from networkx import Graph
from functools import wraps
import json
from dataclasses import dataclass
from typing import Any, Callable, Optional, Literal

from typing import Dict, List, Any
from sqlalchemy.engine.reflection import Inspector
from sqlalchemy.sql.schema import Column

from core.types import (
    ColumnMetadata,
    ColumnPacket,
    ForeignKeyRef,
    TableMetadata,
    TablePacket,
    TableSpec,
)


class MissingRequiredAttributeError(Exception):
    pass


def requires(*attrs: str, error_msg: str = ""):
    def decorator(func):
        @wraps(func)
        def wrapper(self, *args, **kwargs):
            for attr_name in attrs:
                if not getattr(self, attr_name, None):
                    raise MissingRequiredAttributeError(
                        error_msg or f"'{attr_name}' is required but not initialized."
                    )
            return func(self, *args, **kwargs)

        return wrapper

    return decorator


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
        if not hasattr(self, "_inspector"):
            raise MissingRequiredAttributeError(
                "Inspector is not initialized. Call 'create_inspector' first."
            )
        return self._inspector

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
        if hasattr(self, "_inspector"):
            del self._inspector

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
        self._engine = create_engine(self._url, echo=False)
        return self._engine

    @requires("engine")
    def create_inspector(self) -> Inspector:
        if not hasattr(self, "_inspector"):
            self._inspector = Inspector.from_engine(self._engine)
        return self._inspector

    @requires("engine")
    def test_connection(self) -> bool:
        with self._engine.connect() as connection:
            connection.execute(sql_text("SELECT 1"))
            self._connected = True
        return self._connected

    @requires("inspector")
    def get_columns(self, table_name: str) -> list:
        """
        Returns the columns of a table.
        """
        return self._inspector.get_columns(table_name)

    @requires("inspector")
    def get_tables(self) -> dict:
        tables = self._inspector.get_table_names()
        table_info = {table: {"parents": 0, "rows": 0} for table in tables}

        for table in table_info:
            fks = self.inspector.get_foreign_keys(table)
            parents = {fk["referred_table"] for fk in fks if fk.get("referred_table")}
            table_info[table]["parents"] = len(parents)

            with self.engine.connect() as conn:
                result = conn.execute(sql_text(f"SELECT COUNT(*) FROM {table}"))
                table_info[table]["rows"] = result.scalar_one()

        return table_info

    @requires("inspector")
    def sort_tables(self, tables: list[str] | None = None) -> list[str]:
        """
        Sorts the tables based on their foreign key dependencies.
        """

        graph = self.get_dependency_graph(tables or self._inspector.get_table_names())
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

    @requires("inspector")
    def score_edge(self, source: str, target: str) -> int | float:
        fks = self._inspector.get_foreign_keys(target)
        columns = self._inspector.get_columns(target)

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

    @requires("inspector")
    def get_dependency_graph(self, tables: list[str]) -> Graph:
        graph = nx.DiGraph()
        for table in tables:
            for fk in self.inspector.get_foreign_keys(table):
                referred = fk.get("referred_table")
                if referred and referred in tables:
                    graph.add_edge(referred, table)
            graph.add_node(table)
        return graph

    @requires("inspector")
    def get_table_metadata(self, table_name: str) -> TableMetadata:
        if table_name not in self.inspector.get_table_names():
            raise ValueError(f"Table '{table_name}' does not exist in the database.")

        fk_map = self.get_foreign_keys(table_name)
        pk = self.inspector.get_pk_constraint(table_name).get("constrained_columns", [])
        cols = self.inspector.get_columns(table_name)

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

            column_metadata = ColumnMetadata(
                name=name,
                type=str(dtype),
                primary_key=name in pk,
                nullable=col.get("nullable", True),
                default=handle_default(col.get("default")),
                autoincrement=bool(col.get("autoincrement")),
                computed=bool(col.get("computed")),
                foreign_keys=fk_map.get(name, ForeignKeyRef(table="", column="")),
                length=getattr(dtype, "length", None)
                or getattr(dtype, "precision", None),
            )
            columns.append(column_metadata)

        return TableMetadata(
            uniques=self.get_unique_columns(table_name),
            parents=list(set(t.table for t in fk_map.values())),
            columns=columns,
        )

    @requires("inspector")
    def get_unique_columns(self, table: str) -> list[tuple[str, ...]]:
        """Return UNIQUE constraints — each as a tuple of column names (sorted)."""
        unique_cols = set()

        def add_unique(cols: Sequence[str | None] | None):
            if cols:
                unique_cols.add(tuple(sorted(c for c in cols if c is not None)))

        for uc in self.inspector.get_unique_constraints(table):
            add_unique(uc.get("column_names"))

        for idx in self.inspector.get_indexes(table):
            if idx.get("unique"):
                add_unique(idx.get("column_names"))

        pk = self.inspector.get_pk_constraint(table).get("constrained_columns", [])
        add_unique(pk)

        return sorted(unique_cols)

    @requires("inspector")
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


class Populator:
    def __init__(self):
        self.faker = Faker()

    @property
    def methods(self) -> list[str]:
        if not hasattr(self, "_methods"):
            self._methods = []
            for method in dir(self.faker):
                with contextlib.suppress(Exception):
                    if not method.startswith("_"):
                        getattr(self.faker, method)()
                        self._methods.append(method)

        return self._methods

    def verify_dataset(self, db: DatabaseManager, table_spec: TableSpec) -> TablePacket:
        metadata = db.get_table_metadata(table_spec.name)
        columns = {c.name: c for c in metadata.columns}
        table_packet = TablePacket(name=table_spec.name, columns=[])

        single_uniques = {u[0] for u in metadata.uniques if len(u) == 1}
        # multi_uniques = [u for u in metadata.uniques if len(u) > 1]  # Not used yet

        for col in table_spec.columns:
            if col.method is None:
                continue

            # Run validation
            self.verify_method(col)

            # Choose generation function
            method_fn = self.get_processing_method(col)

            # Preload forbidden values for unique checks
            forbidden = set()
            if col.name in single_uniques:
                with db.engine.connect() as conn:
                    result = conn.execute(
                        sql_text(
                            f"SELECT {col.name} FROM {table_spec.name} WHERE {col.name} IS NOT NULL"
                        )
                    )
                    forbidden = set(row[0] for row in result)

            # Generate value (retry if in forbidden)
            value = method_fn(columns, col)
            while forbidden and value in forbidden:
                forbidden.remove(value)
                value = method_fn(columns, col)

            table_packet.columns.append(ColumnPacket(name=col.name, value=str(value)))

        return table_packet

    def get_processing_method(self, col) -> Callable:
        return {
            "faker": self.make_faker,
            # "regex": self.make_regex,  # future
            # "py": self.make_python,  # future
            # "foreign": self.make_foreign,  # future
        }.get(col.type, lambda *_: None)

    def make_faker(self, spec, col) -> Any:
        func = getattr(self.faker, col.method)
        value = func()
        if isinstance(value, str) and spec[col.name].length is not None:
            value = value[: spec[col.name].length]
        return value

    def verify_method(self, col):
        if col.type == "faker":
            func = getattr(self.faker, col.method, None)
            assert callable(
                func
            ), f"Faker method '{col.method}' is not callable or doesn't exist."
            assert func() is not None, f"Faker method '{col.method}' returned None."
        # Add other verifiers for regex, py, foreign later


class Response:
    def __init__(
        self,
        status: Literal["ok", "error"],
        payload: Optional[Any] = None,
        error: Optional[str] = None,
        traceback: Optional[str] = None,
    ):
        self.status = status
        self.payload = payload
        self.error = error
        self.traceback = traceback

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "payload": self.payload,
            "error": self.error,
            "traceback": self.traceback,
        }


class Request(BaseModel):
    kind: str
    body: dict[str, Any] | None = None

    @staticmethod
    def _snake(s: str) -> str:
        return re.sub(r"(?<!^)(?=[A-Z])", "_", s).lower()

    @classmethod
    def _transform(cls, obj: Any) -> Any:
        if isinstance(obj, dict):
            return {cls._snake(k): cls._transform(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [cls._transform(v) for v in obj]
        return obj

    @model_validator(mode="before")
    @classmethod
    def normalize_body(cls, data: dict) -> dict:
        if "body" in data:
            data["body"] = cls._transform(data["body"])
        return data
