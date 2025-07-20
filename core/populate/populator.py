import ast
import contextlib
import math
from dataclasses import dataclass
from numbers import Number
import random
import re
from typing import Any, Callable, cast

from faker import Faker
import rstr
import faker

from core.helpers import cap_numeric, cap_string
from core.utils.decorators import with_cache
from core.utils.exceptions import ValidationError, ValidationWarning, VerificationError
from .database import DatabaseManager
from core.utils.types import (
    ColumnMetadata,
    ColumnSpec,
    ErrorPacket,
    TableMetadata,
    TablePacket,
    TableSpec,
)


class Populator:
    def __init__(self):
        self.faker = Faker()
        self.cache = {}

    @property
    def methods(self) -> list[str]:
        if not hasattr(self, "_methods"):
            self._methods = []
            for method in dir(self.faker):
                with contextlib.suppress(Exception):
                    if not method.startswith("_"):
                        getattr(self.faker, method)()
                        self._methods.append(method)

        return self._methods

    def resolve_specifications(
        self, dbm: DatabaseManager, table_spec: TableSpec
    ) -> TablePacket:
        _errors, ordered_columns = self._validate_and_sort_specs(table_spec.columns)
        errors, entries = self.build_table_entries(dbm, ordered_columns, table_spec)

        return TablePacket(
            name=table_spec.name,
            columns=[col.name for col in table_spec.columns],
            entries=entries,
            errors=_errors + errors,
        )

    def build_table_entries(
        self,
        dbm: DatabaseManager,
        ordered_columns: list[ColumnSpec],
        table_spec: TableSpec,
    ) -> tuple[list[ErrorPacket], list[list[str]]]:

        metadata = dbm.get_table_metadata(table_spec.name)
        errors = []
        column_values: dict[str, list[str]] = {
            col.name: [""] * table_spec.no_of_entries for col in table_spec.columns
        }

        for col_spec in ordered_columns:
            col_meta = metadata.get_column(col_spec.name)
            assert col_meta, f"Column {col_spec.name} not found"

            try:
                make_func = self.get_make_func(col_spec)
                generated_rows = self.populate_column(
                    dbm=dbm,
                    table_meta=metadata,
                    col_spec=col_spec,
                    make_func=make_func,
                    rows=table_spec.no_of_entries,
                    entries=column_values,
                )

                limit = min(len(generated_rows), table_spec.no_of_entries)
                column_values[col_spec.name][:limit] = generated_rows[:limit]

                if len(generated_rows) < table_spec.no_of_entries:
                    error = (
                        f"Failed to populate column '{col_spec.name}' in table '{table_spec.name}': "
                        f"{len(generated_rows)}/{table_spec.no_of_entries} values generated."
                    )
                    if col_meta.nullable:
                        raise ValidationWarning(error)
                    else:
                        raise ValidationError(error)

            except ValidationWarning as e:
                errors.append(
                    ErrorPacket(column=col_spec.name, type="warning", msg=str(e))
                )
            except Exception as e:
                errors.append(
                    ErrorPacket(column=col_spec.name, type="error", msg=str(e))
                )

        # make the entries row major
        return errors, list(map(list, zip(*column_values.values())))

    @dataclass
    class Context:
        dbm: DatabaseManager
        table: TableMetadata
        col_spec: ColumnSpec
        n: int
        entries: dict[str, list[str]] | None = None

        @property
        def column(self) -> ColumnMetadata:
            if self.table is None or self.col_spec is None:
                raise ValueError("Table or column specification is missing.")
            return self.table.get_column(self.col_spec.name)

        @property
        def cache(self) -> dict[str, Any]:
            if not hasattr(self, "_cache"):
                self._cache = {}
            return self._cache

    # region make functions
    def get_make_func(self, col_spec: ColumnSpec):
        fns = {
            "faker": self.make_faker,
            "python": self.make_python,
            "foreign": self.make_foreign,
            "regex": self.make_regex,
            "autoincrement": self.make_autoincrement,
            "computed": self.make_computed
        }
        if col_spec.type in fns:
            return fns[col_spec.type]

        raise ValueError(f"Unknown type `{col_spec.type}` for column `{col_spec.name}`")

    def make_faker(self, context: Context) -> list:
        assert context.col_spec.generator, "Faker generator is not specified."
        faker_fn = getattr(self.faker, context.col_spec.generator)
        return self._sample_values(context.n, faker_fn, context.column)

    def make_python(self, context: Context) -> list:
        if not context.col_spec.generator:
            return []

        assert context.entries
        try:
            tree = ast.parse(context.col_spec.generator)
            generator_func = next(
                (
                    node
                    for node in tree.body
                    if isinstance(node, ast.FunctionDef) and node.name == "generator"
                ),
                None,
            )

            # Prepare the environment for execution
            env = {
                "faker": faker,
                "columns": {},
                "order": lambda x: (lambda f: f),
                "__builtins__": __builtins__,
            }
            exec(compile(tree, filename="<ast>", mode="exec"), env)

            # Call the generator function
            gen = env["generator"]
            col = context.column

            rows = []
            for idx in range(context.n):
                columns = {key: context.entries[key][idx] for key in context.entries}
                val = gen(columns=columns)

                if isinstance(val, str):
                    val = cap_string(val, col.length)
                elif isinstance(val, Number):
                    val = cap_numeric(val, col.precision, col.scale)  # type: ignore

                rows.append(str(val))
            return rows

        except SyntaxError as e:
            raise VerificationError(f"Syntax Error in Python script: {e}")

    def make_regex(self, context: Context) -> list:
        regex_fn = lambda: rstr.xeger(context.col_spec.generator or "")
        return self._sample_values(context.n, regex_fn, context.column)

    def make_foreign(self, context: Context) -> list:
        column = context.column
        fk = column.foreign_keys
        cache = context.cache
        dbm = context.dbm

        if not fk:
            raise ValueError(f"No foreign key reference for column {column.name}")

        if not f"{fk.table}.{fk.column}" in cache:
            cache[f"{fk.table}.{fk.column}"] = dbm.get_existing_values(
                fk.table, fk.column
            )

        rows = cache[f"{fk.table}.{fk.column}"]

        return [random.choice(rows) for _ in range(context.n)]

    def make_autoincrement(self, context: Context) -> list:
        existing = context.dbm.get_existing_values(
            context.table.name, context.column.name
        )
        max_val = max((v for v in existing if isinstance(v, int)), default=0)

        return [f"{max_val + i + 1} [auto]" for i in range(context.n)]

    def make_computed(self, context: Context) -> list:
        return ["[expr]" for _ in range(context.n)]

    # endregion

    # region helpers

    def _sample_values(self, n: int, gen_fn: Callable, col: ColumnMetadata) -> list:
        overshoot = math.ceil(n * 1.5)
        rows = []
        for _ in range(overshoot):
            val = gen_fn()

            if isinstance(val, str):
                val = cap_string(val, col.length)
            elif isinstance(val, Number):
                val = cap_numeric(val, col.precision, col.scale)  # type: ignore

            rows.append(str(val))

        return list(rows)

    def populate_column(
        self,
        dbm: DatabaseManager,
        table_meta: TableMetadata,
        col_spec: ColumnSpec,
        make_func: Callable,
        rows: int,
        entries: dict[str, list[str]],
    ) -> list:
        max_attempts = 10
        generated_rows = []

        context = self.Context(
            dbm=dbm,
            table=table_meta,
            col_spec=col_spec,
            n=rows,
            entries=entries if entries else None,
        )
        column = context.column

        for _ in range(max_attempts):
            generated_rows: list[str] = make_func(context=context)
            generated_rows = self._filter_rows(context=context, rows=generated_rows)

            if len(generated_rows) >= rows:
                break
            elif column.foreign_keys:
                break

        return generated_rows

    def _validate_and_sort_specs(
        self, specs: list[ColumnSpec]
    ) -> tuple[list[ErrorPacket], list[ColumnSpec]]:

        def check_faker(generator: str):
            if not callable(getattr(self.faker, generator, None)):
                raise VerificationError(
                    f"Faker method '{c_spec.generator}' is not callable or doesn't exist."
                )

        def check_python(generator: str) -> int | None:
            try:
                tree = ast.parse(generator)

                for node in tree.body:
                    if isinstance(node, ast.FunctionDef) and node.name == "generator":
                        if len(node.args.args) != 1 or (
                            node.args.args[0].arg != "columns"
                        ):
                            raise ValueError(
                                "generator() must take exactly 1 arg: 'columns'."
                            )
                        for deco in node.decorator_list:
                            if (
                                isinstance(deco, ast.Call)
                                and getattr(deco.func, "id", "") == "order"
                            ):
                                if isinstance(
                                    deco.args[0], ast.Constant
                                ) and isinstance(deco.args[0].value, int):
                                    return deco.args[0].value
                        raise ValueError("Missing @order(int) decorator")
                raise ValueError("No valid generator() function found")
            except SyntaxError as e:
                raise ValueError(f"Syntax Error: {e}")

        def check_regex(generator: str):
            # This will raise an error if the regex is invalid
            re.compile(generator)

        def check_foreign(generator: str):
            return True

        def check_autoincrement(generator: str):
            return True

        def check_computed(generator: str):
            return True

        errors = []

        type_handlers = {
            "faker": check_faker,
            "regex": check_regex,
            "foreign": check_foreign,
            "autoincrement": check_autoincrement,
            "computed": check_computed,
            "python": None,  # handled separately
        }
        groups = {
            "faker": [],
            "regex": [],
            "foreign": [],
            "autoincrement": [],
            "computed": [],
            "python": {},
        }

        for c_spec in specs:
            if c_spec.type is None or c_spec.generator is None:
                continue

            try:
                ctype = c_spec.type

                if ctype == "python":
                    order = check_python(c_spec.generator) or 0  # type: ignore
                    while order in groups["python"]:
                        order += 1
                    groups["python"][order] = c_spec
                elif ctype in type_handlers:
                    type_handlers[ctype](c_spec.generator)
                    groups[ctype].append(c_spec)
                else:
                    raise ValueError(f"Unsupported column type: {ctype}")
            except ValidationWarning as e:
                errors.append(
                    ErrorPacket(
                        column=c_spec.name,
                        type="warning",
                        msg=f"Validation warning for column '{c_spec.name}': {str(e)}",
                    )
                )
            except Exception as e:
                errors.append(
                    ErrorPacket(
                        column=c_spec.name,
                        type="error",
                        msg=f"Error in column '{c_spec.name}': {str(e)}",
                    )
                )

        result = (
            groups["faker"]
            + groups["regex"]
            + groups["foreign"]
            + groups["autoincrement"]
            + groups["computed"]
            + [spec for _, spec in sorted(groups["python"].items())]
        )
        return errors, result

    def _filter_rows(self, context: Context, rows: list[str]) -> list[str]:
        filtered_rows = rows
        table = context.table
        col_spec = context.col_spec
        cache = context.cache
        dbm = context.dbm

        def satisfy_unique(rows: list[str]) -> list[str]:
            seen = set()
            unique_row = [row for row in rows if not (row in seen or seen.add(row))]
            cache_key = f"{table.name}.{col_spec.name}"
            if cache is not None:
                if cache_key in cache:
                    forbidden = cache[cache_key]
                else:
                    forbidden = cache[cache_key] = set(
                        dbm.get_existing_values(table.name, col_spec.name)
                    )
                return [row for row in unique_row if row not in forbidden]

            return unique_row

        col_md = table.get_column(col_spec.name)
        assert col_md, f"Column {col_spec.name} not found in table {table.name}"
        if col_md.unique:
            filtered_rows = satisfy_unique(filtered_rows)

        return filtered_rows

    # endregion
