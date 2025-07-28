import json
import sys
import traceback

from sqlalchemy import create_engine, text
from tabulate import tabulate

def main():
    try:
        db_url, code = json.loads(sys.stdin.read())
        output = []
        engine = create_engine(db_url)
        with engine.begin() as conn:
            result = conn.execute(text(code))
            if result.returns_rows:
                rows = result.fetchall()
                headers = list(result.keys())
                output.extend(
                    tabulate(rows, headers=headers, tablefmt="grid").splitlines()
                )
                output.append(f"{len(rows)} row(s) in set")
            else:
                output.append(f"Query OK, {result.rowcount} row(s) affected")
        print(json.dumps(output), flush=True)
    except Exception as e:
        print(
            json.dumps([f"ERROR 8008 (4200): {e}", traceback.format_exc()]), flush=True
        )


if __name__ == "__main__":
    main()
