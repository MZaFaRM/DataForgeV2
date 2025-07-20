import base64
import enum
import os
from core.utils.types import GeneratorType

from sqlalchemy import (
    Column,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

# fmt: off
class DbCreds(Base):
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    host = Column(String, nullable=False)
    port = Column(String, nullable=False)
    user = Column(String, nullable=False)
    _password = Column("password", String, nullable=False)

    __tablename__ = "db_creds"
    __table_args__ = (UniqueConstraint("name", "host", "port", name="uq_dbcreds_identity"),)

    def __init__(self, **kwargs):
        raw_password = kwargs.pop("password", "")
        super().__init__(**kwargs)
        self.password = raw_password

    @property
    def password(self) -> str:
        return base64.b64decode(self._password.encode()).decode()

    @password.setter
    def password(self, value: str):
        self._password = base64.b64encode(value.encode()).decode()


class TableSpecModel(Base):
    id = Column(Integer, primary_key=True, autoincrement=True)
    db_id = Column(Integer, ForeignKey("db_creds.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    no_of_entries = Column(Integer, nullable=False)
    columns = relationship("ColumnSpecModel", back_populates="table", cascade="all, delete-orphan")

    __tablename__ = "table_specs"
    __table_args__ = (UniqueConstraint("db_id", "name", name="uq_table_name_per_db"),)


class ColumnSpecModel(Base):
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    generator = Column(Text, nullable=True)
    type = Column(Enum(GeneratorType), nullable=False)
    table = relationship("TableSpecModel", back_populates="columns")
    table_id = Column(Integer, ForeignKey("table_specs.id", ondelete="CASCADE"), nullable=False)

    __tablename__ = "column_specs"
    __table_args__ = (UniqueConstraint("table_id", "name", name="uq_column_name_per_table"),)
