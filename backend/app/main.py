from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.core.config import get_settings
from app.core.db import Base, engine
from app.core.migrations import ensure_sqlite_columns
from app.models import entities  # noqa: F401


settings = get_settings()
Path(settings.local_upload_dir).mkdir(parents=True, exist_ok=True)
Path("app/static").mkdir(parents=True, exist_ok=True)
Base.metadata.create_all(bind=engine)
ensure_sqlite_columns(engine)

app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router, prefix=settings.api_prefix)
app.mount("/uploads", StaticFiles(directory=settings.local_upload_dir), name="uploads")
app.mount("/static", StaticFiles(directory="app/static"), name="static")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
