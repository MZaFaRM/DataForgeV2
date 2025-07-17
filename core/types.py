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


class ColumnSpec(BaseModel):
    name: str
    null_chance: float
    method: Optional[str] = None
    type: Literal["faker", "regex", "foreign", "auto"]


class TableSpec(BaseModel):
    name: str
    no_of_entries: int
    columns: list[ColumnSpec]


class ErrorPacket(BaseModel):
    generic: Optional[str] = None
    specific: Optional[str] = None
    column: Optional[str] = None
    type: Literal["warning", "error"] = "error"


class TablePacket(BaseModel):
    name: str
    columns: list[str]
    entries: list[list[str]]
    errors: list[ErrorPacket]
