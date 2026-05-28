import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { inngest } from "../../../lib/inngest";

interface ModalResponse {
  s3_key: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { url?: string };

    if (!body.url) {
      return NextResponse.json({ error: "Missing YouTube URL" }, { status: 400 });
    }

    // 1. Call Modal to download + upload to S3
    const modalRes = await fetch(process.env.MODAL_BASE_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: body.url,
        bucket: process.env.S3_BUCKET_NAME,
        region: process.env.AWS_REGION,
        access_key: process.env.AWS_ACCESS_KEY_ID,
        secret_key: process.env.AWS_SECRET_ACCESS_KEY,
      }),
    });

    let s3Key: string = "";
    let status: string = "uploaded";

    if (modalRes.ok) {
      const data = (await modalRes.json()) as ModalResponse;
      s3Key = data.s3_key;
    } else {
      const text = await modalRes.text();
      console.error("Modal failed:", text);
      status = "failed";
      s3Key = `failed/${crypto.randomUUID()}.mp4`; // placeholder
    }

    // 2. Create UploadedFile record in DB (always)
    const uploaded = await prisma.uploadedFile.create({
      data: {
        s3Key,
        status,
        displayName: "YouTube Video",
        userId: "test-user",
      },
    });

    // 3. Trigger Inngest pipeline (always)
    await inngest.send({
      name: "process-video-events",
      data: {
        uploadedFileId: uploaded.id,
        userId: uploaded.userId,
      },
    });

    // 4. Return uploadedFileId to frontend
    return NextResponse.json({ uploadedFileId: uploaded.id, status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
