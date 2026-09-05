import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from .config import settings

database_url = settings.DATABASE_URL
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

try:
    if database_url.startswith("postgresql"):
        # Connection pooling and ping check for cloud PostgreSQL
        engine = create_engine(
            database_url,
            pool_pre_ping=True,
            connect_args={"connect_timeout": 10}
        )
        with engine.connect() as conn:
            pass
    else:
        engine = create_engine(
            database_url,
            connect_args={"check_same_thread": False} if "sqlite" in database_url else {}
        )
except Exception as e:
    print(f"Warning: Database connection failed for {database_url}. Error: {e}")
    print("Falling back to local SQLite database: sqlite:///./revenue_recovery.db")
    settings.DATABASE_URL = "sqlite:///./revenue_recovery.db"
    engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

