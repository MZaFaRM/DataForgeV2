import json
import sys
import threading
import traceback
from typing import Any

from core.types import TableSpec

from .toolkit import DatabaseManager, Populator, Request, Response


class Runner:
    def __init__(self):
        self.db = DatabaseManager()
        self.populator = Populator()

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
                res = self.handle_command(req)
            except Exception as e:
                res = Response(
                    status="error",
                    error=str(e),
                    traceback=traceback.format_exc(),
                ).to_dict()
            finally:
                print(json.dumps(res), flush=True)

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
        return self._ok(self.db.to_dict())

    def _handle_faker_methods(self, _=None) -> dict:
        return self._ok(self.populator.methods)

    def _handle_connect(self, creds: dict) -> dict:
        required = ["host", "user", "port", "name", "password"]
        missing = [k for k in required if not creds.get(k)]

        for k in required:
            setattr(self.db, k, creds.get(k, ""))

        if missing:
            msg = (
                f"Missing required connection parameter: {missing[0]}"
                if len(missing) == 1
                else f"Missing required connection parameters: {', '.join(missing[:-1])}, and {missing[-1]}"
            )
            return self._err(msg)

        self.db.create_url()
        self.db.create_engine()
        self.db.create_inspector()
        self.db.test_connection()

        return self._ok(self.db.to_dict())

    def _handle_disconnect(self, _=None) -> dict:
        self.db = DatabaseManager()
        return self._ok("Disconnected successfully.")

    def _handle_tables(self, _=None) -> dict:
        table_info = {"table_data": {}, "sorted_tables": []}

        t1 = threading.Thread(
            target=lambda: table_info.update(table_data=self.db.get_tables())
        )
        t2 = threading.Thread(
            target=lambda: table_info.update(sorted_tables=self.db.sort_tables())
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

        metadata = self.db.get_table_metadata(body["name"])
        if not metadata:
            return self._err(f"No metadata found for table '{body['name']}'.")

        return self._ok(metadata.model_dump())

    def _handle_verify_spec(self, body: dict) -> dict:
        result = self.populator.verify_dataset(self.db, TableSpec(**body))
        return self._ok(result.model_dump())
