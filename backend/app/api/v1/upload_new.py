"""Upload endpoints — presigned URLs for client-side uploads to S3/MinIO."""

from __future__ import annotations

import secrets
from typing import Any

import boto3
from botocore.client import Config
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.config import Settings, get_settings
from app.core.deps import current_user
from app.db.models import User

_INTERNAL_S3_HOST = "http://minio:9000"

router = APIRouter(prefix="/upload-new", tags=["upload-new"])

# Allowed audio formats for cover song uploads
_COVER_AUDIO_EXTENSIONS = ["mp3", "m4a", "wav", "ogg"]
_COVER_AUDIO_MAX_MB = 50  # 50 MB limit


class PresignedUploadResponse(BaseModel):
    upload_url: str
    public_url: str
    expires_in: int  # seconds


def _get_s3_client(settings: Settings) -> Any:
    """Create boto3 S3 client for MinIO/S3."""
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
        config=Config(signature_version="s3v4"),
    )


@router.post("/cover-source", response_model=PresignedUploadResponse)
async def get_cover_upload_url(
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
) -> PresignedUploadResponse:
    """
    Generate a presigned URL for uploading a cover song source audio file.

    The client uploads the file directly to S3/MinIO using this URL,
    then passes the public_url to /api/v1/generate/cover_song.
    """
    # Generate unique filename
    token = secrets.token_urlsafe(16)
    filename = f"covers/{user.id}/{token}.mp3"

    # Create S3 client
    s3_client = _get_s3_client(settings)

    # Ensure bucket exists
    try:
        s3_client.head_bucket(Bucket=settings.s3_bucket_media)
    except Exception:
        try:
            s3_client.create_bucket(Bucket=settings.s3_bucket_media)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to access storage: {e}",
            ) from e

    # Generate presigned URL for PUT (15 minutes expiry)
    expires_in = 900  # 15 minutes
    try:
        upload_url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.s3_bucket_media,
                "Key": filename,
                "ContentType": "audio/mpeg",
            },
            ExpiresIn=expires_in,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate upload URL: {e}",
        ) from e

    # Public URL for accessing the file after upload
    public_url = f"{settings.s3_public_base_url}/{filename}"

    # Replace the internal Docker hostname in the presigned URL with the public
    # nginx proxy path so browsers can reach MinIO via the public domain.
    # Nginx is configured to forward Host: minio:9000 so the S3 signature
    # (computed for minio:9000) validates correctly at MinIO.
    s3_base = settings.s3_public_base_url.rstrip("/").rsplit("/", 1)[0]  # strip bucket name
    public_upload_url = upload_url.replace(_INTERNAL_S3_HOST, s3_base)

    return PresignedUploadResponse(
        upload_url=public_upload_url,
        public_url=public_url,
        expires_in=expires_in,
    )


@router.post("/test-post")
async def test_post_endpoint() -> dict[str, str]:
    """Test endpoint to verify POST works."""
    return {"message": "POST works!"}
