import json
import sys
import traceback

from .toolkit import DatabaseManager, Response


class BasePopulator:
    def __init__(self):
        self.db = DatabaseManager()

    def handle_command(self, command: dict) -> dict:
        try:
            kind = command.get("kind")

            if kind == "connect":
                # expects: { kind: "connect", creds: {...} }
                creds = command.get("body", {})
                required_keys = ["host", "user", "port", "name", "password"]
                missing = []

                for key in required_keys:
                    value = creds.get(key, "")
                    setattr(self.db, key, value)
                    if not value:
                        missing.append(key)

                if missing:
                    if len(missing) == 1:
                        msg = f"Missing required connection parameter: {missing[0]}."
                    else:
                        msg = f"Missing required connection parameters: {', '.join(missing[:-1])}, and {missing[-1]}."
                    return Response(status="error", error=msg).to_dict()

                self.db.create_url()
                self.db.create_engine()
                self.db.create_inspector()
                self.db.test_connection()

                return Response(status="ok", payload=self.db.to_dict()).to_dict()
            elif kind == "disconnect":
                self.db = DatabaseManager()
                return Response(
                    status="ok", payload="Disconnected successfully."
                ).to_dict()

            elif kind == "get_tables":
                # expects: { kind: "get_tables" }
                tables = self.db.get_table_names()
                return Response(
                    status="ok",
                    payload=tables,
                ).to_dict()

            elif kind == "get_foreign_keys":
                # expects: { kind: "get_foreign_keys", table: "users" }
                table = command.get("body", "")
                fks = self.db.get_foreign_keys(table)
                return Response(
                    status="ok",
                    payload=fks,
                ).to_dict()

            elif kind == "get_graph":
                # expects: { kind: "get_graph", tables: [...] }
                tables = command.get("body", [])
                graph = self.db.get_dependency_graph(tables)
                return Response(
                    status="ok",
                    payload={
                        "edges": list(graph.edges()),
                    },
                ).to_dict()

            elif kind == "ping":
                return Response(
                    status="ok",
                    payload="pong",
                ).to_dict()

            elif kind == "get_info":
                return Response(
                    status="ok",
                    payload=self.db.to_dict(),
                ).to_dict()

            else:
                return Response(
                    status="error",
                    error=f"Unknown command: {kind}",
                ).to_dict()

        except Exception as e:
            return Response(
                status="error",
                error=str(e),
                traceback=traceback.format_exc(),
            ).to_dict()

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
                res = self.handle_command(req)
            except Exception as e:
                res = Response(
                    status="error",
                    error=str(e),
                    traceback=traceback.format_exc(),
                ).to_dict()
            finally:
                print(json.dumps(res), flush=True)
