import base64
import os
from sqlalchemy import Boolean, Column, PrimaryKeyConstraint, String
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class DbCreds(Base):
    __tablename__ = "dbcreds"

    name = Column(String, nullable=False)
    host = Column(String, nullable=False)
    port = Column(String, nullable=False)
    user = Column(String, nullable=False)
    _password = Column("password", String, nullable=False)

    __table_args__ = (PrimaryKeyConstraint("name", "host", "port"),)

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


db_path = os.path.join(os.path.expanduser("~"), ".dataforge", "config.db")
