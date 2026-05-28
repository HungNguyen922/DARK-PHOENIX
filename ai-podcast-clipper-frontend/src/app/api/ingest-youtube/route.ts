import { NextRequest, NextResponse } from "next/server";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

import { db } from "~/server/db";
import { auth } from "~/server/auth";
import { env } from "~/env";
import { inngest } from "~/inngest/client";

const execFileAsync = promisify(execFile);

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);

    if (u.hostname === "youtu.be") {
      return u.pathname.slice(1) ?? null;
    }

    if (u.hostname.includes("youtube.com")) {
      return u.searchParams.get("v") ?? null;
    }

    return null;
  } catch {
    return null;
  }
}

async function downloadYouTubeToTmp(url: string): Promise<string> {
  const tmpDir = "/tmp";
  const outputPath = path.join(tmpDir, "original.mp4");

  try {
    await fs.unlink(outputPath);
  } catch {}

  await execFileAsync("yt-dlp", [
    "-f",
    "mp4",
    "-o",
    outputPath,
    url,
  ]);

  return outputPath;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Auth
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse body
    const body: { url?: string } | null = await req.json().catch(() => null);
    const url = body?.url ?? undefined;

    if (!url) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    // 3. Extract YouTube ID
    const videoId = extractYouTubeId(url);
    if (!videoId) {
      return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
    }

    // 4. Download video
    const filePath = await downloadYouTubeToTmp(url);
    const fileBuffer = await fs.readFile(filePath);

    // 5. Upload to S3
    const s3Client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });

    const s3Key = `original/${videoId}.mp4`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: "video/mp4",
      })
    );

    // 6. Create UploadedFile record
    const uploadedFile = await db.uploadedFile.create({
      data: {
        userId: session.user.id,
        s3Key,
        displayName: `YouTube ${videoId}`,
        uploaded: true,
        status: "uploaded",
      },
      select: { id: true },
    });

    // 7. Trigger Inngest pipeline
    await inngest.send({
      name: "process-video-events",
      data: {
        uploadedFileId: uploadedFile.id,
        userId: session.user.id,
      },
    });

    // 8. Return success
    return NextResponse.json(
      {
        status: "ok",
        uploadedFileId: uploadedFile.id,
        s3Key,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("ingest-youtube error", err);
    return NextResponse.json(
      { error: "Internal error during YouTube ingestion" },
      { status: 500 }
    );
  }
}
