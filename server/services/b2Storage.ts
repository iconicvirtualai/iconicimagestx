/**
 * Backblaze B2 through its S3-compatible endpoint.
 * The browser uploads and downloads with presigned URLs. This module never
 * reads file bytes into the function.
 */

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { contentDisposition } from "../../shared/mediaLibrary";

export interface B2ClientConfig {
  endpoint: string;
  region: string;
  bucket: string;
  forcePathStyle: true;
  credentials: { accessKeyId: string; secretAccessKey: string };
  requestChecksumCalculation: "WHEN_REQUIRED";
  responseChecksumValidation: "WHEN_REQUIRED";
}

export interface StoredObject {
  size: number;
  contentType: string;
}

export interface SignedPut {
  url: string;
  headers: Record<string, string>;
}

export interface B2Storage {
  presignPut(key: string, contentType: string): Promise<SignedPut>;
  presignGet(key: string, filename: string, inline: boolean): Promise<string>;
  createMultipart(key: string, contentType: string): Promise<{ uploadId: string }>;
  presignPart(key: string, uploadId: string, partNumber: number): Promise<SignedPut>;
  completeMultipart(key: string, uploadId: string, parts: { partNumber: number; eTag: string }[]): Promise<void>;
  abortMultipart(key: string, uploadId: string): Promise<void>;
  head(key: string): Promise<StoredObject | null>;
  move(from: string, to: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class StorageError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "StorageError";
    this.status = status;
  }
}

/** Pure env check. Missing or non-HTTPS settings stay unconfigured. */
export function b2ClientConfig(env: NodeJS.ProcessEnv = process.env): B2ClientConfig | null {
  const endpoint = env.B2_ENDPOINT?.trim() || "";
  const region = env.B2_REGION?.trim() || "";
  const bucket = env.B2_BUCKET?.trim() || "";
  const accessKeyId = env.B2_KEY_ID?.trim() || "";
  const secretAccessKey = env.B2_APPLICATION_KEY?.trim() || "";
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) return null;
  if (!endpoint.startsWith("https://") || endpoint.includes(" ") || bucket.includes("/")) return null;
  return {
    endpoint,
    region,
    bucket,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  };
}

export class UnconfiguredB2 implements B2Storage {
  private fail(): never {
    throw new StorageError(503, "Backblaze storage is not configured.");
  }
  presignPut(): Promise<SignedPut> { this.fail(); }
  presignGet(): Promise<string> { this.fail(); }
  createMultipart(): Promise<{ uploadId: string }> { this.fail(); }
  presignPart(): Promise<SignedPut> { this.fail(); }
  completeMultipart(): Promise<void> { this.fail(); }
  abortMultipart(): Promise<void> { this.fail(); }
  head(): Promise<StoredObject | null> { this.fail(); }
  move(): Promise<void> { this.fail(); }
  remove(): Promise<void> { this.fail(); }
}

export class S3BackblazeStorage implements B2Storage {
  private client: S3Client;
  private bucket: string;

  constructor(config: B2ClientConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: config.credentials,
      requestChecksumCalculation: config.requestChecksumCalculation,
      responseChecksumValidation: config.responseChecksumValidation,
    });
  }

  async presignPut(key: string, contentType: string): Promise<SignedPut> {
    const url = await getSignedUrl(this.client, new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    }), { expiresIn: 60 * 60 });
    return { url, headers: { "Content-Type": contentType } };
  }

  async presignGet(key: string, filename: string, inline: boolean): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: contentDisposition(filename, inline),
    }), { expiresIn: 15 * 60 });
  }

  async createMultipart(key: string, contentType: string): Promise<{ uploadId: string }> {
    const created = await this.client.send(new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    }));
    if (!created.UploadId) throw new StorageError(502, "Backblaze did not start the upload.");
    return { uploadId: created.UploadId };
  }

  async presignPart(key: string, uploadId: string, partNumber: number): Promise<SignedPut> {
    const url = await getSignedUrl(this.client, new UploadPartCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    }), { expiresIn: 60 * 60 });
    return { url, headers: {} };
  }

  async completeMultipart(key: string, uploadId: string, parts: { partNumber: number; eTag: string }[]): Promise<void> {
    await this.client.send(new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts
          .slice()
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((part) => ({ PartNumber: part.partNumber, ETag: part.eTag })),
      },
    }));
  }

  async abortMultipart(key: string, uploadId: string): Promise<void> {
    await this.client.send(new AbortMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
    }));
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const found = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return {
        size: found.ContentLength ?? 0,
        contentType: found.ContentType || "application/octet-stream",
      };
    } catch (err) {
      if (isMissing(err)) return null;
      throw err;
    }
  }

  async move(from: string, to: string): Promise<void> {
    if (from === to) return;
    const occupied = await this.head(to);
    if (occupied) throw new StorageError(409, "A file already exists at that name.");
    await this.client.send(new CopyObjectCommand({
      Bucket: this.bucket,
      Key: to,
      CopySource: encodeURI(`${this.bucket}/${from}`),
    }));
    await this.remove(from);
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export function storageFromEnv(env: NodeJS.ProcessEnv = process.env): B2Storage {
  const config = b2ClientConfig(env);
  return config ? new S3BackblazeStorage(config) : new UnconfiguredB2();
}

function isMissing(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String(err.name) : "";
  const code = "$metadata" in err && err.$metadata && typeof err.$metadata === "object" && "httpStatusCode" in err.$metadata
    ? Number(err.$metadata.httpStatusCode)
    : 0;
  return name === "NotFound" || name === "NoSuchKey" || code === 404;
}
