import os
from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from core.utils.models import Base, ColumnSpecModel, DbCreds, TableSpecModel
from core.utils.types import ColumnSpec, DbCredsSchema, TableSpec
from core.settings import DB_PATH


class DBFRegistry:
    def __init__(self):
        self.engine = create_engine(f"sqlite:///{DB_PATH}", echo=False)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)

    def save_cred(self, cred: DbCredsSchema):
        with self.Session() as session:
            db_cred = DbCreds(**cred.model_dump())
            session.add(db_cred)
            session.flush()
            pk = int(db_cred.id)  # type: ignore
            session.commit()
            return pk

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
        with self.Session() as session:
            row = (
                session.query(TableSpecModel)
                .filter_by(db_id=spec.db_id, name=spec.name)
                .first()
            )
            if row:
                session.delete(row)

            db_spec = TableSpecModel(
                db_id=spec.db_id,
                name=spec.name,
                no_of_entries=spec.no_of_entries,
                columns=[ColumnSpecModel(**col.model_dump()) for col in spec.columns],
            )
            session.merge(db_spec)
            session.commit()

    def get_spec(self, db_id: int, table_name: str) -> TableSpec | None:
        with self.Session() as session:
            row = (
                session.query(TableSpecModel)
                .filter_by(db_id=db_id, name=table_name)
                .first()
            )
            if row:
                spec = TableSpec.model_validate(
                    {
                        **row.__dict__,
                        "columns": [
                            ColumnSpec.model_validate(col.__dict__)
                            for col in row.columns
                        ],
                    }
                )
                return spec
            return None
