import { prisma } from "~/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";

export default async function UploadDetailsPage(
  props: { params: { id: string } }
) {
  const { id } = props.params;

  const upload = await prisma.uploadedFile.findUnique({
    where: { id },
    include: { clips: true },
  });

  if (!upload) return notFound();

  const buildS3Url = (key: string) =>
    `https://${process.env.NEXT_PUBLIC_S3_BUCKET}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${key}`;

  return (
    <div className="space-y-6 px-4 py-8">
      <Link href="/dashboard" className="text-sm underline">
        ← Back to dashboard
      </Link>

      <h1 className="text-2xl font-semibold">
        Clips for: {upload.displayName ?? "Uploaded File"}
      </h1>

      <p className="text-sm text-muted-foreground">
        Status: <span className="font-mono">{upload.status}</span>
      </p>

      {upload.clips.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No clips generated yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {upload.clips.map((clip, i) => {
            const url = buildS3Url(clip.s3Key);

            return (
              <div key={clip.id} className="rounded border p-4 space-y-2">
                <video controls className="w-full rounded" src={url} />

                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    Clip #{i + 1}
                  </span>

                  <a href={url} download className="text-xs underline">
                    Download
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
