import modal
import subprocess
import os
import boto3
from uuid import uuid4

app = modal.App("youtube-downloader")

image = (
    modal.Image.debian()
    .apt_install(
        "ffmpeg",
        "nodejs",
        "npm",
        "ca-certificates",
        "curl",
        "wget",
        "gnupg",
        "libnss3",
        "libatk1.0-0",
        "libatk-bridge2.0-0",
        "libx11-6",
        "libxcomposite1",
        "libxdamage1",
        "libxext6",
        "libxfixes3",
        "libxrandr2",
        "libgbm1",
        "libasound2",
    )
    .pip_install("yt-dlp", "boto3", "fastapi[standard]")
)

@app.function(
    image=image,
    timeout=600,
    env={"YT_DLP_ENABLE_JS": "1"}
)
@modal.fastapi_endpoint(method="POST")
def download_youtube(body: dict):
    url = body["url"]
    bucket = body["bucket"]
    region = body["region"]
    access_key = body["access_key"]
    secret_key = body["secret_key"]

    output_path = f"/tmp/{uuid4()}.mp4"

    # Force yt-dlp to use the correct Node path
    subprocess.run(
        [
            "yt-dlp",
            "--js-runtime", "node:/usr/bin/node",
            "-t", "mp4",
            "-o", output_path,
            url
        ],
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
