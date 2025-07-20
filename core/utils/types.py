from typing import Literal, Optional
from pydantic import BaseModel


class ForeignKeyRef(BaseModel):
    table: str
    column: str


class ColumnMetadata(BaseModel):
    name: str
    type: str
    unique: bool
    multi_unique: Optional[tuple[str, ...]] = None
    primary_key: bool
    nullable: bool
    default: Optional[str] = None
    autoincrement: bool
    computed: bool
    foreign_keys: Optional[ForeignKeyRef] = None
    length: Optional[int] = None
    precision: Optional[int] = None
    scale: Optional[int] = None


class TableMetadata(BaseModel):
    name: str
    parents: list[str]
    columns: list[ColumnMetadata]

    @property
    def column_map(self) -> dict[str, ColumnMetadata]:
        return {col.name: col for col in self.columns}

    def get_column(self, name: str) -> ColumnMetadata:
        column = self.column_map.get(name)
        if column is None:
            raise ValueError(f"Column '{name}' not found in table '{self.name}'.")
        return column


class ColumnSpec(BaseModel):
    name: str
    null_chance: float
    generator: Optional[str] = None
    type: Literal["faker", "regex", "foreign", "python", "autoincrement", "computed"]


class TableSpec(BaseModel):
    name: str
    no_of_entries: int
    columns: list[ColumnSpec]


class ErrorPacket(BaseModel):
    type: Literal["warning", "error"] = "error"
    column: Optional[str] = None
    msg: Optional[str] = None


class TablePacket(BaseModel):
    name: str
    columns: list[str]
    entries: list[list[str]]
    errors: list[ErrorPacket]


class DbCredsSchema(BaseModel):
    name: str
    host: str
    port: str
    user: str
    password: str
    connected: bool = False

    model_config = {"from_attributes": True}
