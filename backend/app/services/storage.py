from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile
from supabase import Client, create_client

from app.core.config import get_settings


class ProductImageStorage:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.client: Client | None = None
        if self.settings.supabase_url and self.settings.supabase_service_role_key:
            self.client = create_client(
                str(self.settings.supabase_url),
                self.settings.supabase_service_role_key,
            )

    def upload(self, tenant_id: str, file: UploadFile, folder: str = "products") -> str:
        suffix = Path(file.filename or "").suffix.lower() or ".jpg"
        object_path = f"{tenant_id}/{folder}/{uuid4()}{suffix}"
        content = file.file.read()
        if not content:
            raise RuntimeError("Arquivo vazio.")

        if not self.client:
            upload_dir = Path(self.settings.local_upload_dir)
            destination = upload_dir / object_path
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(content)
            return f"{self.settings.public_base_url.rstrip('/')}/uploads/{object_path}"

        self.client.storage.from_(self.settings.supabase_storage_bucket).upload(
            object_path,
            content,
            {"content-type": file.content_type or "application/octet-stream"},
        )
        return self.client.storage.from_(self.settings.supabase_storage_bucket).get_public_url(object_path)
