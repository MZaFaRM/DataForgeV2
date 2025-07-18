import ast
import contextlib
import math
from dataclasses import dataclass
from numbers import Number
from typing import Any, Callable

from faker import Faker

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
        cache = {}
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
                    cache=cache,
                )

                for row_index in range(
                    min(len(generated_rows), table_spec.no_of_entries)
                ):
                    column_values[col_spec.name][row_index] = generated_rows[row_index]

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

    # region make functions
    def get_make_func(self, col_spec: ColumnSpec):
        fns = {
            "faker": self.make_faker,
            "python": self.make_python,
            "foreign": self.make_foreign,
            "regex": self.make_regex,
        }
        if col_spec.type in fns:
            return fns[col_spec.type]

        raise ValueError(f"Unknown type `{col_spec.type}` for column `{col_spec.name}`")

    def make_faker(
        self, col_meta: ColumnMetadata, col_spec: ColumnSpec, n: int
    ) -> list:
        assert col_spec.generator
        faker_fn = getattr(self.faker, col_spec.generator)
        col = col_meta
        return self._sample_values(n, faker_fn, col)

    def make_python(self, col_meta: ColumnMetadata, c_spec: ColumnSpec, n: int) -> list:
        if not c_spec.generator:
            return []

        try:
            tree = ast.parse(c_spec.generator)
            generator_func = next(
                (
                    node
                    for node in tree.body
                    if isinstance(node, ast.FunctionDef) and node.name == "generator"
                ),
                None,
            )

            columns = c_spec.generator

            # Prepare the environment for execution
            env = {
                "faker": self.faker,
                "columns": columns,
                "__builtins__": __builtins__,
            }
            exec(compile(tree, filename="<ast>", mode="exec"), env)

            # Call the generator function
            gen = env["generator"]
            return self._sample_values(
                n,
                lambda: gen(columns, Faker()),
                col_meta,
            )

        except SyntaxError as e:
            raise VerificationError(f"Syntax Error in Python script: {e}")

    def make_regex(self, col_meta: ColumnMetadata, c_spec: ColumnSpec, n: int) -> list:
        raise NotImplementedError("Regex generation is not implemented yet.")

    def make_foreign(
        self, col_meta: ColumnMetadata, c_spec: ColumnSpec, n: int
    ) -> list:
        raise NotImplementedError("Foreign key generation is not implemented yet.")

    # endregion

    # region helpers

    def _sample_values(self, n: int, gen_fn: Callable, col: ColumnMetadata) -> list:
        overshoot = math.ceil(n * 1.5)
        rows = []
        for _ in range(overshoot):
            val = gen_fn()

            if isinstance(val, str):
                val = cap_string(gen_fn(), col.length)
            elif isinstance(val, Number):
                val = cap_numeric(gen_fn(), col.precision, col.scale)

            rows.append(str(val))

        return list(rows)

    def populate_column(
        self,
        dbm: DatabaseManager,
        table_meta: TableMetadata,
        col_spec: ColumnSpec,
        make_func: Callable,
        rows: int,
        cache: dict[str, Any] | None = None,
    ) -> list:
        max_attempts = 10
        generated_rows = []
        col_meta = table_meta.get_column(col_spec.name)
        assert col_meta, f"Column {col_spec.name} not found in table {table_meta.name}"
        for _ in range(max_attempts):
            generated_rows = make_func(
                col_meta=col_meta,
                col_spec=col_spec,
                n=rows - len(generated_rows),
            )

            generated_rows = self._filter_rows(
                dbm=dbm,
                table_meta=table_meta,
                c_spec=col_spec,
                rows=generated_rows,
                cache=cache,
            )

            if len(generated_rows) >= rows:
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
                        if len(node.args.args) != 2 or (
                            node.args.args[0].arg != "columns"
                            and node.args.args[1].arg != "faker"
                        ):
                            raise ValueError(
                                "generator() must take exactly 2 args: 'columns', 'faker'."
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
            raise NotImplementedError()

        def check_foreign(generator: str):
            raise NotImplementedError()

        type_handlers = {
            "faker": check_faker,
            "regex": check_regex,
            "foreign": check_foreign,
            "python": None,  # handled separately
        }
        errors = []

        groups = {"faker": [], "regex": [], "foreign": [], "python": {}}

        for c_spec in specs:
            if c_spec.type is None or c_spec.generator is None:
                continue

            try:
                ctype = c_spec.type

                if ctype == "python":
                    order = check_python(c_spec.generator) or 0
                    while order in groups["python"]:
                        order += 1
                    groups["python"][order] = c_spec
                elif ctype in type_handlers:
                    type_handlers[ctype](c_spec.generator)
                    groups[ctype].append(c_spec)
                else:
                    raise ValueError(f"Unsupported column type: {ctype}")
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
            + [spec for _, spec in sorted(groups["python"].items())]
        )
        return errors, result

    def _filter_rows(
        self,
        dbm: DatabaseManager,
        table_meta: TableMetadata,
        c_spec: ColumnSpec,
        rows: list,
        cache: dict[str, Any] | None = None,
    ) -> list:
        def satisfy_s_unique(rows: list) -> list:
            if c_spec.name in table_meta.s_uniques:
                set_rows = set(rows)
                cache_key = f"forbidden.{table_meta.name}.{c_spec.name}"
                if cache is not None:
                    if cache_key in cache:
                        forbidden = cache[cache_key]
                    else:
                        forbidden = cache[cache_key] = set(
                            dbm.get_existing_values(table_meta.name, c_spec.name)
                        )
                    return list(set_rows.difference(forbidden))
            return rows

        return satisfy_s_unique(rows)

    # endregion
