import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: "Missing YouTube URL" }, { status: 400 });
    }

    const modalRes = await fetch(process.env.MODAL_BASE_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        bucket: process.env.S3_BUCKET_NAME,
        region: process.env.AWS_REGION,
        access_key: process.env.AWS_ACCESS_KEY_ID,
        secret_key: process.env.AWS_SECRET_ACCESS_KEY,
      }),
    });

    if (!modalRes.ok) {
      const text = await modalRes.text();
      return NextResponse.json({ error: text }, { status: 500 });
    }

    const data = await modalRes.json();

    // Example: return the S3 key to the frontend
    return NextResponse.json({ s3_key: data.s3_key });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
