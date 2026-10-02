import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let client: S3Client | null = null;

function configuration() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) throw new Error("Cloudflare R2 is not configured");
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

function storageClient() {
  if (client) return client;
  const { accountId, accessKeyId, secretAccessKey } = configuration();
  client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return client;
}

export function r2Configured() {
  return Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);
}

export async function uploadToR2(key: string, body: Buffer, contentType: string) {
  const { bucket } = configuration();
  await storageClient().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: "private, max-age=3600",
  }));
  return `r2://${bucket}/${key}`;
}

export async function deleteFromR2(reference: string) {
  const { bucket } = configuration();
  const key = reference.replace(/^r2:\/\/[^/]+\//, "");
  await storageClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function signedR2Url(reference: string) {
  const { bucket } = configuration();
  const key = reference.replace(/^r2:\/\/[^/]+\//, "");
  return getSignedUrl(storageClient(), new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 });
}
