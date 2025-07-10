import os
from sqlalchemy.engine import Engine, Inspector
from sqlalchemy import create_engine
from sqlalchemy import text as sql_text
from sqlalchemy.engine.interfaces import ReflectedForeignKeyConstraint
import networkx as nx
from networkx import Graph
from functools import wraps
import json
from dataclasses import dataclass
from typing import Any, Optional, Literal


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
    def get_tables(self) -> dict:
        tables = self._inspector.get_table_names()
        table_info = {table: {"parents": 0, "rows": 0} for table in tables}

        for table in table_info:
            fks = self._inspector.get_foreign_keys(table)
            table_info[table]["parents"] = len(fks)

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
    def get_foreign_keys(self, table_name: str) -> list[ReflectedForeignKeyConstraint]:
        return self._inspector.get_foreign_keys(table_name)

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
            for fk in self.get_foreign_keys(table):
                referred = fk.get("referred_table")
                if referred and referred in tables:
                    graph.add_edge(referred, table)
            graph.add_node(table)
        return graph


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
