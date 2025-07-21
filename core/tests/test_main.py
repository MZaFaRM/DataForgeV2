import pytest
from core.runner import Runner
from core.utils.response import Request


import json
import pytest
from unittest.mock import patch, MagicMock
from core.utils.response import Request

TEST_CREDS = {
    "host": "localhost",
    "port": 3306,
    "user": "root",
    "name": "test",
    # "password": "1234567890",
}


@pytest.fixture
def runner():
    return Runner()


def test_handle_ping(runner: Runner):
    req = Request(kind="ping", body={})
    res = runner.handle_command(req)
    assert res["status"] == "ok"
    assert res["payload"] == "pong"


def test_handle_unknown_command(runner: Runner):
    req = Request(kind="unknown_cmd", body={})
    res = runner.handle_command(req)
    assert res["status"] == "error"
    assert "Unknown command" in res["error"]


def test_handle_connect_missing_params(runner: Runner):
    req = Request(kind="connect", body={})
    res = runner.handle_command(req)
    assert res["status"] == "error"
    assert "Missing required connection" in res["error"]


def test_connect_success(runner: Runner):
    creds = TEST_CREDS.copy()
    creds["password"] = "1234567890"
    req = Request(kind="connect", body=creds)
    res = runner.handle_command(req)
    assert res["status"] == "ok", res["error"]


def test_run_sql_create_insert_select(runner: Runner):
    res = runner.handle_command(Request(kind="reconnect", body=TEST_CREDS))
    assert res["status"] == "ok", res["error"]
    res = runner.handle_command(
        Request(kind="run_sql", body={"sql": "SELECT * FROM students"})
    )
    assert res["status"] == "ok"


def test_table_metadata(runner: Runner):
    res = runner.handle_command(Request(kind="reconnect", body=TEST_CREDS))
    assert res["status"] == "ok", "Error connecting to database"
    req = Request(kind="table_metadata", body={"name": "students"})
    res = runner.handle_command(req)
    assert res["status"] == "ok", "Error fetching table metadata"
    assert "columns" in res["payload"]


def test_get_logs(runner: Runner):
    res = runner.handle_command(Request(kind="get_logs", body={"lines": 10}))
    assert res["status"] == "ok", "Error fetching logs"
    assert isinstance(res["payload"], list)


def test_disconnect(runner: Runner):
    req = Request(kind="reconnect", body=TEST_CREDS)
    res = runner.handle_command(req)
    assert res["status"] == "ok", "Error connecting to database"

    disc = runner.handle_command(Request(kind="disconnect", body={}))
    assert disc["status"] == "ok", "Error disconnecting from database"


def test_list_connections(runner: Runner):
    req = Request(kind="reconnect", body=TEST_CREDS)
    res = runner.handle_command(req)
    assert res["status"] == "ok", "Error connecting to database"

    res = runner.handle_command(Request(kind="list_connections", body={}))
    assert res["status"] == "ok", res["error"]
    assert isinstance(res["payload"], list)


def test_get_faker_gen(runner: Runner):
    res = runner.handle_command(Request(kind="get_faker_gen", body={}))
    assert res["status"] == "ok", res["error"]
    assert isinstance(res["payload"], list)


def test_tables_command(runner: Runner):
    req = Request(kind="reconnect", body=TEST_CREDS)
    res = runner.handle_command(req)
    assert res["status"] == "ok", "Error connecting to database"

    res = runner.handle_command(Request(kind="tables", body={}))
    assert res["status"] == "ok", "Error fetching tables"
    assert isinstance(res["payload"], list)


def test_reconnect(runner: Runner):
    creds = TEST_CREDS.copy()
    creds.pop("password", None)

    req = Request(kind="reconnect", body=creds)
    res = runner.handle_command(req)
    assert res["status"] == "ok", f"Reconnect failed, Req: {req}, Res: {res}"

    res = runner.handle_command(Request(kind="tables", body={}))
    assert res["status"] == "ok", "Error fetching tables after reconnect"
    assert isinstance(res["payload"], list)

    assert res["status"] == "ok"


def test_load_spec(runner: Runner):
    req = Request(kind="reconnect", body=TEST_CREDS)
    res = runner.handle_command(req)
    assert res["status"] == "ok", res["error"]

    body = {"dbId": 1, "tableName": "teachers"}
    response = runner.handle_command(Request(kind="load_spec", body=body))
    assert response["status"] == "ok", f"Load spec failed: {response['error']}"


def test_empty_verify_spec(runner: Runner):
    req = Request(kind="reconnect", body=TEST_CREDS)
    res = runner.handle_command(req)
    assert res["status"] == "ok", res["error"]

    body = {
        "name": "teachers",
        "noOfEntries": 50,
        "columns": [
            {"name": "teacher_id", "generator": None, "type": "faker"},
            {"name": "full_name", "generator": None, "type": "regex"},
            {"name": "department", "generator": None, "type": "foreign"},
            {"name": "salary", "generator": None, "type": "python"},
        ],
    }
    response = runner.handle_command(Request(kind="verify_spec", body=body))
    assert response["status"] == "ok", f"Load spec failed: {response['error']}"
    assert len(response["payload"]["entries"]) == 0, response["payload"]


def test_verify_teachers_table_spec(runner: Runner):
    req = Request(kind="reconnect", body=TEST_CREDS)
    res = runner.handle_command(req)
    assert res["status"] == "ok", res["error"]

    body = {
        "name": "teachers",
        "noOfEntries": 50,
        "columns": [
            {
                "name": "teacher_id",
                "generator": "autoincrement",
                "type": "autoincrement",
            },
            {"name": "full_name", "generator": "name", "type": "faker"},
            {
                "name": "department",
                "generator": "^(CS|MECH|CIVIL|IT)$",
                "type": "regex",
            },
            {
                "name": "salary",
                "generator": "# import builtins + faker\n# Py fields run after faker/foreign/regex/etc\nimport random\n@order(1)\ndef generator(columns):\n\treturn random.randint(30_000, 60_000)",
                "type": "python",
            },
        ],
    }

    response = runner.handle_command(Request(kind="verify_spec", body=body))
    assert response["status"] == "ok", f"Load spec failed: {response['error']}"
    assert len(response["payload"]["errors"]) == 0, response["payload"]["errors"]
    assert len(response["payload"]["entries"][0]) == len(body["columns"]), response[
        "payload"
    ]["entries"]


def test_uncommitted(runner: Runner):
    req = Request(kind="reconnect", body=TEST_CREDS)
    res = runner.handle_command(req)
    assert res["status"] == "ok", res["error"]

    body = {"dbId": 1, "tableName": "teachers"}
    response = runner.handle_command(Request(kind="load_spec", body=body))
    assert response["status"] == "ok", f"Load spec failed: {response['error']}"

    for i in range(1, 4):
        load_res = runner.handle_command(
            Request(kind="verify_spec", body=response["payload"])
        )
        assert load_res["status"] == "ok", load_res["error"]

        insert_res = runner.handle_command(
            Request(kind="insert_packet", body=load_res["payload"])
        )
        assert insert_res["status"] == "ok", insert_res["error"]
        assert insert_res["payload"]["pending_writes"] == i

    commit_res = runner.handle_command(Request(kind="set_rollback_db", body={}))
    assert commit_res["status"] == "ok", commit_res["error"]
    assert runner.dbf.uncommitted == 0


def test_commit_and_rollback(runner: Runner):
    req = Request(kind="reconnect", body=TEST_CREDS)
    res = runner.handle_command(req)
    assert res["status"] == "ok", res["error"]

    body = {"dbId": 1, "tableName": "teachers"}
    response = runner.handle_command(Request(kind="load_spec", body=body))
    assert response["status"] == "ok", f"Load spec failed: {response['error']}"

    load_res = runner.handle_command(
        Request(kind="verify_spec", body=response["payload"])
    )
    assert load_res["status"] == "ok", load_res["error"]

    insert_res = runner.handle_command(
        Request(kind="insert_packet", body=load_res["payload"])
    )
    assert insert_res["status"] == "ok", insert_res["error"]

    commit_res = runner.handle_command(Request(kind="set_rollback_db", body={}))
    assert commit_res["status"] == "ok", commit_res["error"]

    insert_res = runner.handle_command(
        Request(kind="insert_packet", body=load_res["payload"])
    )
    assert insert_res["status"] == "ok", insert_res["error"]

    commit_res = runner.handle_command(Request(kind="set_commit_db", body={}))
    assert commit_res["status"] == "ok", commit_res["error"]

    runner.handle_command(
        Request(kind="run_sql", body={"sql": "DELETE FROM teachers LIMIT 50;"})
    )
    assert commit_res["status"] == "ok", commit_res["error"]


# def test_insert_packet(runner: Runner):
#     req = Request(kind="reconnect", body=TEST_CREDS)
#     res = runner.handle_command(req)
#     assert res["status"] == "ok", res["error"]

#     body = {
#         "name": "teachers",
#         "columns": ["teacher_id", "full_name", "department", "salary"],
#         "entries": [
#             [None, "Gregory Lamb", "IT", "55100"],
#             [None, "Robert Wells", "CS", "32133"],
#             [None, "William Grant", "MECH", "35878"],
#             [None, "Meagan Cline", "MECH", "42095"],
#             [None, "Chase Coleman", "CS", "35753"],
#             [None, "Yolanda West", "CS", "36990"],
#             [None, "Jessica Parsons", "CIVIL", "54170"],
#             [None, "Joshua Martinez", "IT", "30056"],
#             [None, "Susan Gonzalez", "CIVIL", "39751"],
#             [None, "Elizabeth Bowers", "CS", "38867"],
#             [None, "Sharon Nguyen", "CIVIL", "51314"],
#             [None, "Misty Ward", "IT", "44735"],
#             [None, "Jon Vega", "CIVIL", "47897"],
#             [None, "Rachel Scott", "IT", "54591"],
#             [None, "Tina Noble", "MECH", "44018"],
#             [None, "Pamela Wright", "MECH", "37111"],
#             [None, "Dale Weiss", "IT", "44012"],
#             [None, "John Mann", "CIVIL", "37298"],
#             [None, "Craig Rodriguez", "CIVIL", "43242"],
#             [None, "Gordon Wilson", "CS", "48078"],
#             [None, "Carrie Perez", "CS", "44548"],
#             [None, "Robert York", "IT", "51658"],
#             [None, "Jeffrey Lozano", "MECH", "37311"],
#             [None, "Marie Turner", "MECH", "52124"],
#             [None, "Jonathan Holmes", "MECH", "43236"],
#             [None, "Mary Lin", "MECH", "42055"],
#             [None, "Jeremy Cole", "CS", "48148"],
#             [None, "Richard Miller", "MECH", "52431"],
#             [None, "Jamie Gregory", "IT", "35699"],
#             [None, "John Tran", "CS", "46852"],
#             [None, "Jennifer Walton", "CIVIL", "51372"],
#             [None, "Chelsea Brown", "CIVIL", "44862"],
#             [None, "Stephen Smith", "IT", "32604"],
#             [None, "Anthony Graham", "CIVIL", "31340"],
#             [None, "Jennifer Wilkins", "CS", "39162"],
#             [None, "Rebecca Jenkins MD", "MECH", "38298"],
#             [None, "Michael Miller", "IT", "59444"],
#             [None, "Julia Peterson", "MECH", "48126"],
#             [None, "Timothy Bauer", "CIVIL", "52236"],
#             [None, "Laura Pierce", "CIVIL", "48196"],
#             [None, "David Gibson", "IT", "30034"],
#             [None, "Katherine Sanders", "CS", "35318"],
#             [None, "Stacey Mcguire", "IT", "36849"],
#             [None, "Alexis Hooper", "MECH", "43890"],
#             [None, "Tina Lee", "MECH", "51536"],
#             [None, "Donna Richard", "IT", "38350"],
#             [None, "Elizabeth Armstrong", "IT", "40857"],
#             [None, "Jay Price", "IT", "46078"],
#             [None, "Jason Trujillo", "IT", "56435"],
#             [None, "Jeffrey Burton", "IT", "58438"],
#         ],
#     }

#     response = runner.handle_command(Request(kind="insert_packet", body=body))
#     assert response["status"] == "ok", response["error"]
