import modal
import subprocess
import os
import boto3
from uuid import uuid4

app = modal.App("youtube-downloader")

image = (
    modal.Image.debian_slim()
    .apt_install("ffmpeg", "nodejs", "npm")
    .pip_install("yt-dlp", "boto3", "fastapi[standard]")
)

@app.function(image=image, timeout=600)
@modal.fastapi_endpoint(method="POST")
def download_youtube(body: dict):
    url = body["url"]
    bucket = body["bucket"]
    region = body["region"]
    access_key = body["access_key"]
    secret_key = body["secret_key"]

    output_path = f"/tmp/{uuid4()}.mp4"

    subprocess.run(
        ["yt-dlp", "-f", "mp4", "-o", output_path, url],
        check=True
    )

    s3 = boto3.client(
        "s3",
        region_name=region,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
    )

    s3_key = f"original/{os.path.basename(output_path)}"
    s3.upload_file(output_path, bucket, s3_key)

    return {"s3_key": s3_key}
