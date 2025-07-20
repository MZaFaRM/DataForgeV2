import os
from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from core.utils.models import Base, DbCreds, db_path
from core.utils.types import DbCredsSchema, TableSpec


class ConfigDatabase:
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

    def load_cred(
        self, name: str, host: str, port: str, user: str
    ) -> Optional[DbCredsSchema]:
        with self.Session() as session:
            row = (
                session.query(DbCreds)
                .filter_by(name=name, host=host, port=port, user=user)
                .first()
            )
            return DbCredsSchema.model_validate(row) if row else None

    def list_creds(self) -> list[dict[str, str | int]]:
        with self.Session() as session:
            rows = (
                session.query(
                    DbCreds.id,
                    DbCreds.name,
                    DbCreds.host,
                    DbCreds.port,
                    DbCreds.user,
                )
                .tuples()
                .all()
            )

            return [
                {"id": id, "name": name, "host": host, "port": port, "user": user}
                for id, name, host, port, user in rows
            ]

    def delete_cred(self, name: str, host: str, port: str, user: str):
        with self.Session() as session:
            row = (
                session.query(DbCreds)
                .filter_by(name=name, host=host, port=port, user=user)
                .first()
            )
            if row:
                session.delete(row)
                session.commit()

    def save_specs(self, spec: TableSpec):
        pass
