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
    "password": "1234567890",
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
    req = Request(kind="connect", body=TEST_CREDS)
    res = runner.handle_command(req)
    assert res["status"] == "ok", res["error"]


def test_run_sql_create_insert_select(runner: Runner):
    res = runner.handle_command(Request(kind="connect", body=TEST_CREDS))
    assert res["status"] == "ok", "Error connecting to database"
    res = runner.handle_command(
        Request(kind="run_sql", body={"sql": "SELECT * FROM students"})
    )
    assert res["status"] == "ok"


def test_table_metadata(runner: Runner):
    res = runner.handle_command(Request(kind="connect", body=TEST_CREDS))
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
    req = Request(kind="connect", body=TEST_CREDS)
    res = runner.handle_command(req)
    assert res["status"] == "ok", "Error connecting to database"

    disc = runner.handle_command(Request(kind="disconnect", body={}))
    assert disc["status"] == "ok", "Error disconnecting from database"


def test_list_connections(runner: Runner):
    req = Request(kind="connect", body=TEST_CREDS)
    res = runner.handle_command(req)
    assert res["status"] == "ok", "Error connecting to database"

    res = runner.handle_command(Request(kind="list_connections", body={}))
    assert res["status"] == "ok", "Error listing connections"
    assert isinstance(res["payload"], list)


def test_faker_methods(runner: Runner):
    res = runner.handle_command(Request(kind="faker_methods", body={}))
    assert res["status"] == "ok", "Error fetching faker methods"
    assert isinstance(res["payload"], list)


def test_tables_command(runner: Runner):
    req = Request(kind="connect", body=TEST_CREDS)
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


def test_verify_teachers_table_spec(runner: Runner):
    req = Request(kind="connect", body=TEST_CREDS)
    res = runner.handle_command(req)
    assert res["status"] == "ok", res["error"]

    payload = {
        "name": "teachers",
        "noOfEntries": 50,
        "columns": [
            {
                "name": "teacher_id",
                "nullChance": 0,
                "generator": "autoincrement",
                "type": "autoincrement",
            },
            {
                "name": "full_name",
                "nullChance": 0,
                "generator": "name",
                "type": "faker",
            },
            {
                "name": "department",
                "nullChance": 0,
                "generator": "^(CS|MECH|CIVIL|IT)$",
                "type": "regex",
            },
            {
                "name": "salary",
                "nullChance": 0,
                "generator": "# import builtins + faker\n# Py fields run after faker/foreign/regex/etc\nimport random\n@order(1)\ndef generator(columns):\n\treturn random.randint(30_000, 60_000)\n",
                "type": "python",
            },
        ],
    }

    response = runner.handle_command(Request(kind="verify_spec", body=payload))
    assert response["status"] == "ok", f"Verify spec failed: {response['error']}"
    assert (
        response["payload"]["errors"] == []
    ), "Errors found in table spec verification"
    assert len(response["payload"]["entries"][0]) == len(response["payload"]["columns"])
