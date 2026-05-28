import modal
import subprocess
import os
import boto3
from uuid import uuid4

app = modal.App("youtube-downloader")

# Modal image with yt-dlp installed
image = (
    modal.Image.debian_slim()
    .apt_install("ffmpeg", "python3-pip")
    .pip_install("yt-dlp", "boto3", "fastapi[standard]")
)

@app.function(image=image, timeout=600)
@modal.fastapi_endpoint(method="POST")
def download_youtube(url: str, bucket: str, region: str, access_key: str, secret_key: str):
    # 1. Download video to /tmp
    output_path = f"/tmp/{uuid4()}.mp4"

    subprocess.run(
        ["yt-dlp", "-f", "mp4", "-o", output_path, url],
        check=True
    )

    # 2. Upload to S3
    s3 = boto3.client(
        "s3",
        region_name=region,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
    )

    s3_key = f"original/{os.path.basename(output_path)}"
    s3.upload_file(output_path, bucket, s3_key)

    return {"s3_key": s3_key}
