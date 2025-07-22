import json
import os
from pathlib import Path
import sys
import threading
import traceback
from typing import Any

from core.settings import LOG_PATH
from core.utils.types import TablePacket, TableSpec

from core.populate.populator import Populator
from core.populate.factory import DatabaseFactory
from core.utils.response import Request, Response


import logging


class Runner:
    def __init__(self):
        self.dbf = DatabaseFactory()
        self.populator = Populator()
        self._setup_logger()

    def _setup_logger(self):
        self.logger = logging.getLogger("RunnerLogger")
        self.logger.setLevel(logging.INFO)
        log_path = Path(os.path.join(LOG_PATH, "runner.log"))
        log_path.parent.mkdir(parents=True, exist_ok=True)

        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        handler = logging.FileHandler(log_path, mode="a")
        formatter = logging.Formatter(
            "%(asctime)s | %(levelname)s | %(message)s", "%Y-%m-%d %H:%M:%S"
        )
        handler.setFormatter(formatter)
        self.logger.addHandler(handler)

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
                self.logger.info(f"Received: {line}")
                req = json.loads(line)
                req = Request(**req)
                res_obj = self.handle_command(req)
                res = json.dumps(res_obj)
                self.logger.info(f"Response: {res}")
            except Exception as e:
                tb = traceback.format_exc()
                res_obj = Response(status="error", error=str(e), traceback=tb).to_dict()
                res = json.dumps(res_obj)
                self.logger.error(f"Error: {str(e)}\nTraceback: {tb}")
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

    def _handle_get_info_db(self, _=None) -> dict:
        return self._ok(self.dbf.to_dict())

    def _handle_get_faker_gen(self, _=None) -> dict:
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

        self.dbf = DatabaseFactory()
        if schema := self.dbf.exists(
            name=creds["name"],
            user=creds["user"],
            host=creds["host"],
            port=creds["port"],
        ):
            self.dbf = DatabaseFactory()
            self.dbf.from_schema(schema)
            self.dbf.test_connection()
        else:
            self.dbf = DatabaseFactory()
            self.dbf.from_dict(creds)
            self.dbf.test_connection()
            self.dbf.save()

        return self._ok(self.dbf.to_dict())

    def _handle_reconnect(self, creds: dict):
        if not creds:
            return self._err("DB details needed.")

        name, host, port, user = (
            creds.get(cred, None) for cred in ("name", "host", "port", "user")
        )
        if None in (name, host, port, user):
            return self._err("Requires name, host and port to reconnect")

        if schema := self.dbf.exists(
            name=creds["name"],
            user=creds["user"],
            host=creds["host"],
            port=creds["port"],
        ):
            self.dbf = DatabaseFactory()
            self.dbf.from_schema(schema)
            self.dbf.test_connection()
            return self._ok(self.dbf.to_dict())

        return self._err("Unknown database.")

    def _handle_list_connections(self, _=None) -> dict:
        creds = [cred.model_dump() for cred in self.dbf.registry.list_creds()]
        return self._ok(creds)

    def _handle_delete_connection(self, body: dict) -> dict:
        if not body:
            return self._err("DB details needed.")
        name, host, port, user = (
            body.get(cred, None) for cred in ("name", "host", "port", "user")
        )
        if name is None or host is None or port is None or user is None:
            return self._err("Requires name, host and port to delete connection")

        self.dbf.registry.delete_cred(name=name, host=host, port=port, user=user)
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
        specs, result = self.populator.resolve_specifications(
            self.dbf, TableSpec(**body)
        )
        self.dbf.registry.save_specs(specs)
        return self._ok(result.model_dump())

    def _handle_load_spec(self, body: dict) -> dict:
        if "table_name" not in body:
            return self._err("Table name is required.")
        if not self.dbf.id:
            return self._err("Not connected to a database.")

        spec = self.dbf.registry.get_spec(
            db_id=self.dbf.id, table_name=body["table_name"]
        )
        return self._ok(spec)

    def _handle_get_banner_sql(self, _: dict):
        return self._ok(self.dbf.get_sql_banner())

    def _handle_run_sql(self, body: dict) -> dict:
        if body is None or "sql" not in body:
            return self._err("SQL query is required.")
        try:
            return self._ok(self.dbf.run_sql(body["sql"]))
        except Exception as e:
            return self._err(f"SQL execution failed: {str(e)}")

    def _handle_get_logs(self, body: dict) -> dict:
        try:
            return self._ok(
                self.dbf.read_logs(lines=(body.get("lines", 200) if body else 200))
            )
        except Exception as e:
            return self._err(f"Failed to retrieve logs: {str(e)}")

    def _handle_clear_logs(self, body: dict) -> dict:
        try:
            return self._ok(self.dbf.clear_logs())
        except Exception as e:
            return self._err(f"Failed to clear logs: {str(e)}")

    def _handle_insert_packet(self, body: dict) -> dict:
        try:
            if not body:
                return self._err("missing params: packet.")
            self.dbf.insert_packet(TablePacket(**body))
            return self._ok({"pending_writes": self.dbf.uncommitted})
        except Exception as e:
            return self._err(f"Error inserting packet: {str(e)}")

    def _handle_set_commit_db(self, _: dict) -> dict:
        self.dbf.commit()
        return self._ok("Committed all transactions successfully!")

    def _handle_set_rollback_db(self, _: dict) -> dict:
        self.dbf.rollback()
        return self._ok("Rollbacked all transactions successfully!")
