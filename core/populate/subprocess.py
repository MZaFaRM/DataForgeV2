from sqlalchemy import create_engine, text as sql_text
from tabulate import tabulate

def run_sql_worker(url: str, sql: str, result_queue):
    output = []
    try:
        engine = create_engine(url)
        with engine.begin() as conn:
            result = conn.execute(sql_text(sql))

            if result.returns_rows:
                rows = result.fetchall()
                headers = list(result.keys())
                output.extend(
                    tabulate(rows, headers=headers, tablefmt="grid").splitlines()
                )
                output.append(f"{len(rows)} row(s) in set")
            else:
                output.append(f"Query OK, {result.rowcount} row(s) affected")
    except Exception as e:
        output.append(f"ERROR 8008 (4200): {str(e)}")
    finally:
        result_queue.put(output)