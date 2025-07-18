from typing import Literal, Optional
from pydantic import BaseModel


class ForeignKeyRef(BaseModel):
    table: str
    column: str


class ColumnMetadata(BaseModel):
    name: str
    type: str
    primary_key: bool
    nullable: bool
    default: Optional[str]
    autoincrement: bool
    computed: bool
    foreign_keys: ForeignKeyRef
    length: Optional[int] = None
    precision: Optional[int] = None
    scale: Optional[int] = None


class TableMetadata(BaseModel):
    name: str
    s_uniques: list[str]
    m_uniques: list[tuple[str, ...]]
    parents: list[str]
    columns: list[ColumnMetadata]

    @property
    def column_map(self) -> dict[str, ColumnMetadata]:
        return {col.name: col for col in self.columns}

    def get_column(self, name: str) -> Optional[ColumnMetadata]:
        return self.column_map.get(name)


class ColumnSpec(BaseModel):
    name: str
    null_chance: float
    generator: Optional[str] = None
    type: Literal["faker", "regex", "foreign", "auto"]


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
