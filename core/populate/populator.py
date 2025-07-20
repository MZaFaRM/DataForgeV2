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
from .factory import ContextFactory, DatabaseFactory, GeneratorFactory
from core.utils.types import GeneratorType as GType
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
        self.tf = GeneratorFactory()

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
        self, dbf: DatabaseFactory, table_spec: TableSpec
    ) -> TablePacket:
        _errors, ordered_columns = self._validate_and_sort_specs(table_spec.columns)
        errors, entries = self.build_table_entries(dbf, ordered_columns, table_spec)

        return TablePacket(
            name=table_spec.name,
            columns=[col.name for col in table_spec.columns],
            entries=entries,
            errors=_errors + errors,
        )

    def build_table_entries(
        self,
        dbf: DatabaseFactory,
        ordered_columns: list[ColumnSpec],
        table_spec: TableSpec,
    ) -> tuple[list[ErrorPacket], list[list[str]]]:

        metadata = dbf.get_table_metadata(table_spec.name)
        errors = []
        column_values: dict[str, list[str]] = {
            col.name: [""] * table_spec.no_of_entries for col in table_spec.columns
        }

        for col_spec in ordered_columns:
            col_meta = metadata.get_column(col_spec.name)
            assert col_meta, f"Column {col_spec.name} not found"

            try:
                generated_rows = self.populate_column(
                    dbf=dbf,
                    table_meta=metadata,
                    col_spec=col_spec,
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

    # endregion

    # region helpers

    def populate_column(
        self,
        dbf: DatabaseFactory,
        table_meta: TableMetadata,
        col_spec: ColumnSpec,
        rows: int,
        entries: dict[str, list[str]],
    ) -> list:
        max_attempts = 10
        generated_rows = []

        context = ContextFactory(
            dbf=dbf,
            table=table_meta,
            col_spec=col_spec,
            n=rows,
            entries=entries if entries else None,
        )
        column = context.column

        for _ in range(max_attempts):
            generated_rows: list[str] = self.tf.make(col_spec.type, context=context)
            generated_rows = self._filter_rows(context=context, rows=generated_rows)

            if len(generated_rows) >= rows:
                break
            elif column.foreign_keys:
                break

        return generated_rows

    def _validate_and_sort_specs(
        self, specs: list[ColumnSpec]
    ) -> tuple[list[ErrorPacket], list[ColumnSpec]]:

        errors = []
        result = []

        result_python = {}

        for c_spec in specs:
            if c_spec.type is None or c_spec.generator is None:
                continue

            try:
                ctype = c_spec.type

                if ctype == GType.python:
                    order = self.tf.check_python(c_spec.generator) or 0
                    while order in result_python:
                        order += 1
                    result_python[order] = c_spec
                elif self.tf.check(ctype, c_spec.generator):
                    result.append(c_spec)
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

        result = result + [spec for _, spec in sorted(result_python.items())]
        return errors, result

    def _filter_rows(self, context: ContextFactory, rows: list[str]) -> list[str]:
        filtered_rows = rows
        table = context.table
        col_spec = context.col_spec
        cache = context.cache
        dbf = context.dbf

        def satisfy_unique(rows: list[str]) -> list[str]:
            seen = set()
            unique_row = [row for row in rows if not (row in seen or seen.add(row))]
            cache_key = f"{table.name}.{col_spec.name}"
            if cache is not None:
                if cache_key in cache:
                    forbidden = cache[cache_key]
                else:
                    forbidden = cache[cache_key] = set(
                        dbf.get_existing_values(table.name, col_spec.name)
                    )
                return [row for row in unique_row if row not in forbidden]

            return unique_row

        col_md = table.get_column(col_spec.name)
        assert col_md, f"Column {col_spec.name} not found in table {table.name}"
        if col_md.unique:
            filtered_rows = satisfy_unique(filtered_rows)

        return filtered_rows

    # endregion
