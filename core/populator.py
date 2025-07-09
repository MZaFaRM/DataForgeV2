import sys
import json
import traceback
from .toolkit import DatabaseManager


class BasePopulator:
    def __init__(self):
        self.db = DatabaseManager()

    def handle_command(self, command: dict) -> dict:
        try:
            kind = command.get("kind")

            if kind == "connect":
                # expects: { kind: "connect", creds: {...} }
                creds = command.get("creds", {})
                self.db.host = creds.get("host", "")
                self.db.user = creds.get("user", "")
                self.db.port = creds.get("port", "")
                self.db.name = creds.get("name", "")
                self.db.password = creds.get("password", "")

                self.db.create_url()
                self.db.create_engine()
                self.db.create_inspector()
                self.db.test_connection()

                return {"status": "ok", "connected": True}

            elif kind == "get_tables":
                # expects: { kind: "get_tables" }
                tables = self.db.get_table_names()
                return {"status": "ok", "tables": tables}

            elif kind == "get_foreign_keys":
                # expects: { kind: "get_foreign_keys", table: "users" }
                table = command.get("table", "")
                fks = self.db.get_foreign_keys(table)
                return {"status": "ok", "foreign_keys": fks}

            elif kind == "get_graph":
                # expects: { kind: "get_graph", tables: [...] }
                tables = command.get("tables", [])
                graph = self.db.get_dependency_graph(tables)
                return {"status": "ok", "edges": list(graph.edges())}

            elif kind == "ping":
                return {"status": "ok", "msg": "pong"}

            else:
                return {"status": "error", "error": f"Unknown command: {kind}"}

        except Exception as e:
            return {
                "status": "error",
                "message": str(e),
                "traceback": traceback.format_exc(),
            }

    def listen(self):
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            elif line == "exit":
                print(json.dumps({"status": "ok", "message": "Exiting..."}), flush=True)
                break
            try:
                req = json.loads(line)
                res = self.handle_command(req)
                print(json.dumps(res), flush=True)
            except Exception as e:
                err = {
                    "status": "error",
                    "message": "Invalid JSON or internal failure",
                    "detail": str(e),
                }
                print(json.dumps(err), flush=True)
