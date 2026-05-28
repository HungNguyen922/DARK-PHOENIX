import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { db } from "~/server/db";
import { auth } from "~/server/auth";
import { env } from "~/env";
import { inngest } from "~/inngest/client";

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


export async function POST(req: NextRequest) {
  try {
    // 1. Auth
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse body safely
    const body = (await req.json()) as unknown;

    if (
      !body ||
      typeof body !== "object" ||
      !("url" in body) ||
      typeof (body as { url: unknown }).url !== "string"
    ) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    const url = (body as { url: string }).url;

    // 3. Extract YouTube ID
    const videoId = extractYouTubeId(url);
    if (!videoId) {
      return NextResponse.json(
        { error: "Invalid YouTube URL" },
        { status: 400 }
      );
    }

    // 4. Ask Modal to download + upload to S3
    const modalRes = await fetch(`${env.MODAL_BASE_URL}/download_youtube`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        bucket: env.S3_BUCKET_NAME,
        region: env.AWS_REGION,
        access_key: env.AWS_ACCESS_KEY_ID,
        secret_key: env.AWS_SECRET_ACCESS_KEY,
      }),
    });

    if (!modalRes.ok) {
      return NextResponse.json(
        { error: "Modal failed to download video" },
        { status: 500 }
      );
    }

    const { s3_key } = (await modalRes.json()) as { s3_key: string };

    const s3Key = s3_key;

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
