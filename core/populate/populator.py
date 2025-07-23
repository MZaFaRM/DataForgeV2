from collections import OrderedDict
import contextlib
from typing import Any

from faker import Faker

from core.utils.exceptions import ValidationError, ValidationWarning
from core.utils.types import ColumnMetadata, ColumnSpec, ErrorPacket
from core.utils.types import GeneratorType as GType
from core.utils.types import TableMetadata, TablePacket, TableSpec

from .factory import ContextFactory, DatabaseFactory, GeneratorFactory


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
    ) -> tuple[TableSpec, TablePacket]:
        if dbf.id is None:
            raise ValueError("Database not initialized with a valid ID.")

        table_spec.db_id = dbf.id
        _errors, ordered_columns = self._validate_and_sort_specs(table_spec.columns)
        errors, column_entries = self.build_table_entries(
            dbf, ordered_columns, table_spec
        )

        columns = list(column_entries.keys())
        rows = list(map(list, zip(*column_entries.values())))
        return (
            table_spec,
            TablePacket(
                name=table_spec.name,
                columns=columns,
                entries=rows,
                errors=_errors + errors,
            ),
        )

    def build_table_entries(
        self,
        dbf: DatabaseFactory,
        ordered_columns: list[ColumnSpec],
        table_spec: TableSpec,
    ) -> tuple[list[ErrorPacket], dict[str, list[str | None]]]:

        metadata = dbf.get_table_metadata(table_spec.name)
        errors: list[ErrorPacket] = []
        column_values: dict[str, list[str | None]] = {
            col.name: [None] * table_spec.no_of_entries for col in table_spec.columns
        }

        for col_spec in ordered_columns:
            if col_spec.type is None or col_spec.generator is None:
                continue

            col_meta = metadata.get_column(col_spec.name)
            assert col_meta, f"Column {col_spec.name} not found"

            try:
                generated_rows, errors = self.populate_column(
                    dbf=dbf,
                    table_meta=metadata,
                    col_spec=col_spec,
                    rows=table_spec.no_of_entries,
                    entries=column_values,
                )

                for i in range(min(len(generated_rows), table_spec.no_of_entries)):
                    column_values[col_spec.name][i] = generated_rows[i]

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
        return errors, column_values

    # endregion

    # region helpers

    def populate_column(
        self,
        dbf: DatabaseFactory,
        table_meta: TableMetadata,
        col_spec: ColumnSpec,
        rows: int,
        entries: dict[str, list[str | None]],
    ) -> tuple[list[str | None], list[ErrorPacket]]:
        max_attempts = 10
        generated_rows = []

        context = ContextFactory(
            dbf=dbf,
            table=table_meta,
            col_spec=col_spec,
            n=rows,
            entries=entries,
            errors=[],
        )
        column = context.column

        for _ in range(max_attempts):
            is_computed = col_spec.type == GType.python
            generated_rows: list[str | None] = self.tf.make(
                col_spec.type, context=context
            )

            generated_rows = self._filter_rows(
                context=context,
                rows=generated_rows,
                is_computed=is_computed,
            )
            if is_computed:
                break

            if len(generated_rows) >= rows:
                break
            elif column.foreign_keys:
                break

        return generated_rows, context.errors

    def _validate_and_sort_specs(
        self, specs: list[ColumnSpec]
    ) -> tuple[list[ErrorPacket], list[ColumnSpec]]:

        errors = []
        result = []

        result_python = {}

        for c_spec in specs:
            try:
                if c_spec.type == GType.python and c_spec.generator:
                    order = self.tf.check_python(c_spec.generator)
                    while order in result_python:
                        order += 1
                    result_python[order] = c_spec

                elif not (c_spec.type is None or c_spec.generator is None):
                    self.tf.check(c_spec.type, c_spec.generator)
                    result.append(c_spec)

            except Exception as e:
                errors.append(
                    ErrorPacket(
                        column=c_spec.name,
                        type="error",
                        msg=f"Error in column '{c_spec.name}': {str(e)}",
                    )
                )

        result.extend(result_python[key] for key in sorted(result_python.keys()))
        return errors, result

    def _filter_rows(
        self, context: ContextFactory, rows: list[str | None], is_computed: bool = False
    ) -> list[str | None]:
        filtered_rows = rows
        table = context.table
        col_spec = context.col_spec
        cache = context.cache
        dbf = context.dbf

        def satisfy_unique(
            rows: list[str | None], is_computed: bool
        ) -> list[str | None]:

            seen = set()
            unique_row = [
                row for row in rows if row is None or not (row in seen or seen.add(row))
            ]
            cache_key = f"{table.name}.{col_spec.name}"
            if cache is not None:
                if cache_key in cache:
                    forbidden = cache[cache_key]
                else:
                    forbidden = cache[cache_key] = set(
                        dbf.get_existing_values(table.name, col_spec.name)
                    )
                unique_row = [row for row in unique_row if row not in forbidden]

            if is_computed:
                if len(unique_row) != len(rows):
                    context.errors.append(
                        ErrorPacket(
                            column=col_spec.name,
                            type="error",
                            msg=f"Computed column '{col_spec.name}' in table '{table.name}' must be unique, "
                            f"but {len(rows) - len(unique_row)} duplicates were found.",
                        )
                    )
                return rows
            return unique_row

        col_md = table.get_column(col_spec.name)
        assert col_md, f"Column {col_spec.name} not found in table {table.name}"
        if col_md.unique and context.col_spec.type != GType.null:
            filtered_rows = satisfy_unique(
                filtered_rows,
                is_computed=is_computed,
            )

        return filtered_rows

    # endregion
