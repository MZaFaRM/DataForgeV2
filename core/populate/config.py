import os
from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from core.utils.models import Base, DbCreds, db_path
from core.utils.types import DbCredsSchema


class ConfigHandler:
    def __init__(self):
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.engine = create_engine(f"sqlite:///{db_path}", echo=False)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)

    def save_cred(self, cred: DbCredsSchema):
        with self.Session() as session:
            db_cred = DbCreds(**cred.model_dump())
            session.merge(db_cred)
            session.commit()

    def load_cred(self, name: str, host: str, port: str) -> Optional[DbCredsSchema]:
        with self.Session() as session:
            row = (
                session.query(DbCreds)
                .filter_by(name=name, host=host, port=port)
                .first()
            )
            return DbCredsSchema.model_validate(row) if row else None

    def list_creds(self) -> list[tuple[str, str, str]]:
        with self.Session() as session:
            return (
                session.query(
                    DbCreds.name,
                    DbCreds.host,
                    DbCreds.port,
                )
                .tuples()
                .all()
            )

    def delete_cred(self, name: str, host: str, port: str):
        with self.Session() as session:
            row = (
                session.query(DbCreds)
                .filter_by(name=name, host=host, port=port)
                .first()
            )
            if row:
                session.delete(row)
                session.commit()
