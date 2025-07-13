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
    length: Optional[int]


class TableMetadata(BaseModel):
    name: str
    uniques: list[tuple[str, ...]]
    parents: list[str]
    columns: list[ColumnMetadata]


class ColumnSpec(BaseModel):
    name: str
    null_chance: float
    method: Optional[str] = None
    type: Literal["faker", "regex", "foreign", "auto"]


class ColumnPacket(BaseModel):
    name: str
    value: Optional[str] = None


class TableSpec(BaseModel):
    name: str
    columns: list[ColumnSpec]


class TablePacket(BaseModel):
    name: str
    columns: list[ColumnPacket]
