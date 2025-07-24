import json
import os
from pathlib import Path
import sys
import threading
import traceback
from typing import Any

from core.helpers import requires
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
                _id = req.pop("id", None)
                req = Request(**req)
                res_obj = self.handle_command(req)
                res_obj["id"] = _id
                res = json.dumps(res_obj)
                self.logger.info(f"Response: {res}")
            except Exception as e:
                tb = traceback.format_exc()
                res_obj = Response(status="error", error=str(e), traceback=tb).to_dict()
                res_obj["id"] = _id
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

    @requires()
    def _handle_ping(self, _=None) -> dict:
        return self._ok("pong")

    @requires(connected=True)
    def _handle_get_db_info(self, _=None) -> dict:
        return self._ok(self.dbf.to_dict())

    @requires()
    def _handle_get_gen_methods(self, _=None) -> dict:
        return self._ok(self.populator.methods)

    @requires("host", "user", "port", "name", "password")
    def _handle_set_db_connect(self, creds: dict) -> dict:
        self.dbf.disconnect()
        if saved := self.dbf.registry.exists(
            name=creds["name"],
            user=creds["user"],
            host=creds["host"],
            port=creds["port"],
        ):
            self.dbf.from_schema(saved)
        else:
            self.dbf.from_dict(creds)
        try:
            self.dbf.test_connection()
        except Exception as e:
            self.dbf.disconnect()
            return self._err(str(e))

        if not saved:
            self.dbf.save()

        return self._ok(self.dbf.to_dict())

    @requires("name", "host", "port", "user")
    def _handle_set_db_reconnect(self, creds: dict):
        self.dbf.disconnect()
        if schema := self.dbf.registry.exists(
            name=creds["name"],
            user=creds["user"],
            host=creds["host"],
            port=creds["port"],
        ):
            self.dbf.from_schema(schema)
            try:
                self.dbf.test_connection()
                return self._ok(self.dbf.to_dict())
            except Exception as e:
                self.dbf.disconnect()
                return self._err(str(e))

        return self._err("Unknown database.")

    @requires()
    def _handle_get_pref_connections(self, _=None) -> dict:
        creds = [cred.model_dump() for cred in self.dbf.registry.list_creds()]
        return self._ok(creds)

    @requires("name", "host", "port", "user")
    def _handle_set_pref_delete(self, body: dict) -> dict:
        self.dbf.disconnect()
        self.dbf.registry.delete_cred(
            name=body["name"],
            host=body["host"],
            port=body["port"],
            user=body["user"],
        )
        return self._ok("Connection deleted successfully.")

    @requires()
    def _handle_set_db_disconnect(self, _=None) -> dict:
        self.dbf.disconnect()
        return self._ok("Disconnected successfully.")

    @requires(connected=True)
    def _handle_get_db_tables(self, _=None) -> dict:
        table_info = {"table_data": {}, "sorted_tables": []}
        _ = self.dbf.engine
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

    @requires("name", connected=True)
    def _handle_get_db_table(self, body: dict) -> dict:
        metadata = self.dbf.get_table_metadata(body["name"])
        if not metadata:
            return self._err(f"No metadata found for table '{body['name']}'.")

        return self._ok(metadata.model_dump())

    @requires(TableSpec, connected=True)
    def _handle_get_gen_packets(self, body: dict) -> dict:
        specs, result = self.populator.build_packets(self.dbf, TableSpec(**body))
        self.dbf.registry.save_specs(specs)
        return self._ok(result.model_dump())

    @requires("page", "packet_id", connected=True)
    def _handle_get_gen_packet(self, body: dict) -> dict:
        return self._ok(
            self.populator.get_packet_page(body["page"], body["packet_id"]).model_dump()
        )

    @requires("table_name", connected=True)
    def _handle_get_pref_spec(self, body: dict) -> dict:
        spec = self.dbf.registry.get_spec(
            db_id=self.dbf.id, table_name=body["table_name"]
        )
        return self._ok(spec)

    @requires()
    def _handle_get_sql_banner(self, _: dict):
        return self._ok(self.dbf.get_sql_banner())

    @requires("sql")
    def _handle_run_sql_query(self, body: dict) -> dict:
        try:
            return self._ok(self.dbf.run_sql(body["sql"]))
        except Exception as e:
            return self._err(f"SQL execution failed: {str(e)}")

    @requires()
    def _handle_get_logs_read(self, body: dict) -> dict:
        try:
            return self._ok(
                self.dbf.read_logs(lines=(body.get("lines", 200) if body else 200))
            )
        except Exception as e:
            return self._err(f"Failed to retrieve logs: {str(e)}")

    @requires()
    def _handle_set_logs_clear(self, _: dict) -> dict:
        try:
            return self._ok(self.dbf.clear_logs())
        except Exception as e:
            return self._err(f"Failed to clear logs: {str(e)}")

    @requires("packet_id")
    def _handle_set_db_insert(self, body: dict) -> dict:
        try:
            packet = self.populator.get_packet_page(packet_id=body["packet_id"])
            self.dbf.insert_packet(packet)
            return self._ok({"pending_writes": self.dbf.uncommitted})
        except Exception as e:
            return self._err(f"Error inserting packet: {str(e)}")

    @requires("path", "packet_id")
    def _handle_set_db_export(self, body: dict) -> dict:
        try:
            path = body.pop("path")
            packet = self.populator.get_packet_page(packet_id=body["packet_id"])
            self.dbf.export_sql_packet(packet, path)
            return self._ok(f"SQL packet exported to {path}")
        except Exception as e:
            return self._err(f"Error exporting SQL packet: {str(e)}")

    @requires()
    def _handle_set_db_commit(self, _: dict) -> dict:
        self.dbf.commit()
        return self._ok("Committed all transactions successfully!")

    @requires()
    def _handle_set_db_rollback(self, _: dict) -> dict:
        self.dbf.rollback()
        return self._ok("Rollbacked all transactions successfully!")

    @requires()
    def _handle_get_pref_rows(self, _: dict) -> dict:
        return self._ok(self.dbf.get_database_rows())
