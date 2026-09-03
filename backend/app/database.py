import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from .config import settings

database_url = settings.DATABASE_URL
try:
    if database_url.startswith("postgresql"):
        # Attempt connection with a short timeout to fail fast if DB is down or credentials fail
        engine = create_engine(database_url, connect_args={"connect_timeout": 2})
        # Force a connection test
        with engine.connect() as conn:
            pass
    else:
        engine = create_engine(database_url)
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

