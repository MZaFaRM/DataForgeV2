import json
import sys
import threading
import traceback
from typing import Any

from core.populate.config import ConfigHandler
from core.utils.types import DbCredsSchema, TableSpec

from core.populate.populator import Populator
from core.populate.factory import DatabaseFactory
from core.utils.response import Request, Response


class Runner:
    def __init__(self):
        self.dbf = DatabaseFactory()
        self.populator = Populator()
        self.configs = ConfigHandler()

    def listen(self):
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            elif line == "exit":
                res = json.dumps(Response(status="ok", payload="exiting...").to_dict())
                print(res, flush=True)
                break

            try:
                req = json.loads(line)
                req = Request(**req)
                res = json.dumps(self.handle_command(req))
            except Exception as e:
                res = Response(
                    status="error",
                    error=str(e),
                    traceback=traceback.format_exc(),
                ).to_dict()
            finally:
                print(res, flush=True)

    def handle_command(self, command: Request) -> dict:
        try:
            handler = getattr(self, f"_handle_{command.kind}", None)
            if not handler:
                return self._err(f"Unknown command: {command.kind}")
            return handler(command.body)
        except Exception as e:
            return Response(
                status="error",
                error=str(e),
                traceback=traceback.format_exc(),
            ).to_dict()

    def _ok(self, payload: Any) -> dict:
        return Response(status="ok", payload=payload).to_dict()

    def _err(self, error: str) -> dict:
        return Response(status="error", error=error).to_dict()

    def _handle_ping(self, _=None) -> dict:
        return self._ok("pong")

    def _handle_info(self, _=None) -> dict:
        return self._ok(self.dbf.to_dict())

    def _handle_faker_methods(self, _=None) -> dict:
        return self._ok(self.populator.methods)

    def _handle_connect(self, creds: dict) -> dict:
        required = ["host", "user", "port", "name", "password"]
        missing = [k for k in required if not creds.get(k)]

        if missing:
            msg = (
                f"Missing required connection parameter: {missing[0]}"
                if len(missing) == 1
                else f"Missing required connection parameters: {', '.join(missing[:-1])}, and {missing[-1]}"
            )
            return self._err(msg)

        self.dbf.from_dict(creds)
        self.dbf.connect()
        schema = self.dbf.to_schema()
        self.configs.save_cred(schema)
        return self._ok(self.dbf.to_dict())

    def _handle_reconnect(self, body: dict):
        if not body:
            return self._err("DB details needed.")
        name, host, port, user = (
            body.get(cred, None) for cred in ("name", "host", "port", "user")
        )
        if name is None or host is None or port is None or user is None:
            return self._err("Requires name, host and port to reconnect")

        creds_schema = self.configs.load_cred(
            name=name, host=host, port=port, user=user
        )
        if not creds_schema:
            return self._err("No DB with that credentials found.")

        self.dbf.from_schema(creds_schema)
        self.dbf.connect()
        return self._ok("Reconnected successfully.")

    def _handle_list_connections(self, _=None) -> dict:
        creds = self.configs.list_creds()
        return self._ok(creds)

    def _handle_delete_connection(self, body: dict) -> dict:
        if not body:
            return self._err("DB details needed.")
        name, host, port, user = (
            body.get(cred, None) for cred in ("name", "host", "port", "user")
        )
        if name is None or host is None or port is None or user is None:
            return self._err("Requires name, host and port to delete connection")

        self.configs.delete_cred(name=name, host=host, port=port, user=user)
        return self._ok("Connection deleted successfully.")

    def _handle_disconnect(self, _=None) -> dict:
        self.dbf = DatabaseFactory()
        return self._ok("Disconnected successfully.")

    def _handle_tables(self, _=None) -> dict:
        table_info = {"table_data": {}, "sorted_tables": []}

        t1 = threading.Thread(
            target=lambda: table_info.update(table_data=self.dbf.get_tables())
        )
        t2 = threading.Thread(
            target=lambda: table_info.update(sorted_tables=self.dbf.sort_tables())
        )

        t1.start()
        t2.start()
        t1.join()
        t2.join()

        return self._ok(
            [
                {
                    "name": tbl,
                    "rows": table_info["table_data"][tbl]["rows"],
                    "parents": table_info["table_data"][tbl]["parents"],
                }
                for tbl in table_info["sorted_tables"]
            ]
        )

    def _handle_table_metadata(self, body: dict) -> dict:
        if "name" not in body:
            return self._err("Table name is required.")

        metadata = self.dbf.get_table_metadata(body["name"])
        if not metadata:
            return self._err(f"No metadata found for table '{body['name']}'.")

        return self._ok(metadata.model_dump())

    def _handle_verify_spec(self, body: dict) -> dict:
        result = self.populator.resolve_specifications(self.dbf, TableSpec(**body))
        return self._ok(result.model_dump())

    def _handle_run_sql(self, body: dict) -> dict:
        if body is None or "sql" not in body:
            return self._err("SQL query is required.")
        try:
            self.dbf.run_sql(body["sql"])
            return self._ok("Query executed successfully.")
        except Exception as e:
            return self._err(f"SQL execution failed: {str(e)}")

    def _handle_get_logs(self, body: dict) -> dict:
        try:
            logs = self.dbf.read_logs(lines=(body.get("lines", 200) if body else 200))
            return self._ok(logs)
        except Exception as e:
            return self._err(f"Failed to retrieve logs: {str(e)}")

    def _handle_clear_logs(self, body: dict) -> dict:
        try:
            self.dbf.clear_logs()
            return self._ok("Logs cleared successfully.")
        except Exception as e:
            return self._err(f"Failed to clear logs: {str(e)}")
