/**
 * S3/R2 Client Module
 *
 * Provides a wrapper around the AWS SDK v3 S3 client for cloud sync operations.
 * Supports both AWS S3 and Cloudflare R2 (S3-compatible).
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import type { CloudSyncConfig } from "@/lib/db/schema";

export interface S3ClientOptions {
  provider: "s3" | "r2";
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface TestConnectionResult {
  success: boolean;
  error?: string;
  errorCode?: string;
}

export interface ObjectMetadata {
  lastModified?: Date;
  contentLength?: number;
  etag?: string;
}

/**
 * Creates an S3 client configured for either AWS S3 or Cloudflare R2
 */
export function createS3Client(options: S3ClientOptions): S3Client {
  const config: S3ClientConfig = {
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    },
    // R2 requires a region but doesn't use it - use 'auto'
    region: options.provider === "r2" ? "auto" : options.region || "us-east-1",
  };

  // R2 requires custom endpoint
  if (options.provider === "r2" && options.endpoint) {
    config.endpoint = options.endpoint;
    // R2 requires path-style addressing
    config.forcePathStyle = true;
  } else if (options.endpoint) {
    // Custom S3-compatible endpoint
    config.endpoint = options.endpoint;
    config.forcePathStyle = true;
  }

  return new S3Client(config);
}

/**
 * Creates an S3 client from CloudSyncConfig
 */
export function createS3ClientFromConfig(config: CloudSyncConfig): S3Client {
  return createS3Client({
    provider: config.provider,
    bucket: config.bucket,
    region: config.region,
    endpoint: config.endpoint,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });
}

/**
 * Tests connection to the S3/R2 bucket
 */
export async function testConnection(
  client: S3Client,
  bucket: string
): Promise<TestConnectionResult> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return { success: true };
  } catch (error: unknown) {
    const err = error as Error & { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };

    // Check for specific error types
    if (err.name === "NotFound" || err.Code === "NotFound") {
      return {
        success: false,
        error: "Bucket not found. Please check the bucket name.",
        errorCode: "NOT_FOUND",
      };
    }

    if (err.name === "Forbidden" || err.$metadata?.httpStatusCode === 403) {
      return {
        success: false,
        error: "Access denied. Please check your credentials and bucket permissions.",
        errorCode: "FORBIDDEN",
      };
    }

    if (err.name === "InvalidAccessKeyId" || err.Code === "InvalidAccessKeyId") {
      return {
        success: false,
        error: "Invalid Access Key ID. Please check your credentials.",
        errorCode: "INVALID_KEY",
      };
    }

    if (err.name === "SignatureDoesNotMatch" || err.Code === "SignatureDoesNotMatch") {
      return {
        success: false,
        error: "Invalid Secret Access Key. Please check your credentials.",
        errorCode: "INVALID_SECRET",
      };
    }

    return {
      success: false,
      error: err.message || "Failed to connect to storage",
      errorCode: "UNKNOWN",
    };
  }
}

/**
 * Configures CORS on the bucket to allow browser access
 * This is required for the browser to directly access S3/R2
 */
export async function configureCors(
  client: S3Client,
  bucket: string,
  allowedOrigin: string = typeof window !== "undefined" ? window.location.origin : "*"
): Promise<{ success: boolean; error?: string }> {
  try {
    await client.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedHeaders: ["*"],
              AllowedMethods: ["GET", "PUT", "HEAD", "POST"],
              AllowedOrigins: [allowedOrigin],
              ExposeHeaders: ["ETag"],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      })
    );
    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    return {
      success: false,
      error: err.message || "Failed to configure CORS",
    };
  }
}

/**
 * Uploads data to S3/R2
 */
export async function uploadData(
  client: S3Client,
  bucket: string,
  key: string,
  data: string | Blob,
  contentType: string = "application/json"
): Promise<{ success: boolean; etag?: string; error?: string }> {
  try {
    let body: string | Uint8Array;

    if (data instanceof Blob) {
      body = new Uint8Array(await data.arrayBuffer());
    } else {
      body = data;
    }

    const result = await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );

    return {
      success: true,
      etag: result.ETag,
    };
  } catch (error: unknown) {
    const err = error as Error;
    return {
      success: false,
      error: err.message || "Failed to upload data",
    };
  }
}

/**
 * Downloads data from S3/R2
 */
export async function downloadData(
  client: S3Client,
  bucket: string,
  key: string
): Promise<{ success: boolean; data?: string; error?: string; notFound?: boolean }> {
  try {
    const result = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );

    if (!result.Body) {
      return {
        success: false,
        error: "No data returned",
      };
    }

    // Convert stream to string
    const data = await result.Body.transformToString();

    return {
      success: true,
      data,
    };
  } catch (error: unknown) {
    const err = error as Error & { name?: string; Code?: string };

    if (err.name === "NoSuchKey" || err.Code === "NoSuchKey") {
      return {
        success: false,
        notFound: true,
        error: "Object not found",
      };
    }

    return {
      success: false,
      error: err.message || "Failed to download data",
    };
  }
}

/**
 * Downloads data as a Blob (for database imports)
 */
export async function downloadBlob(
  client: S3Client,
  bucket: string,
  key: string
): Promise<{ success: boolean; data?: Blob; error?: string; notFound?: boolean }> {
  try {
    const result = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );

    if (!result.Body) {
      return {
        success: false,
        error: "No data returned",
      };
    }

    // Convert stream to Uint8Array then to Blob
    const bytes = await result.Body.transformToByteArray();
    // Create a new Uint8Array to ensure proper ArrayBuffer type
    const data = new Uint8Array(bytes);
    const blob = new Blob([data], {
      type: result.ContentType || "application/json"
    });

    return {
      success: true,
      data: blob,
    };
  } catch (error: unknown) {
    const err = error as Error & { name?: string; Code?: string };

    if (err.name === "NoSuchKey" || err.Code === "NoSuchKey") {
      return {
        success: false,
        notFound: true,
        error: "Object not found",
      };
    }

    return {
      success: false,
      error: err.message || "Failed to download data",
    };
  }
}

/**
 * Gets object metadata without downloading the full object
 * Useful for checking if manifest exists and getting last modified time
 */
export async function getObjectMetadata(
  client: S3Client,
  bucket: string,
  key: string
): Promise<{ success: boolean; metadata?: ObjectMetadata; notFound?: boolean; error?: string }> {
  try {
    const result = await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );

    return {
      success: true,
      metadata: {
        lastModified: result.LastModified,
        contentLength: result.ContentLength,
        etag: result.ETag,
      },
    };
  } catch (error: unknown) {
    const err = error as Error & { name?: string; Code?: string };

    if (err.name === "NotFound" || err.Code === "NotFound" || err.name === "NoSuchKey") {
      return {
        success: false,
        notFound: true,
      };
    }

    return {
      success: false,
      error: err.message || "Failed to get object metadata",
    };
  }
}

/**
 * Uploads JSON data with proper serialization
 */
export async function uploadJSON<T>(
  client: S3Client,
  bucket: string,
  key: string,
  data: T
): Promise<{ success: boolean; etag?: string; error?: string }> {
  const jsonString = JSON.stringify(data, null, 2);
  return uploadData(client, bucket, key, jsonString, "application/json");
}

/**
 * Downloads and parses JSON data
 */
export async function downloadJSON<T>(
  client: S3Client,
  bucket: string,
  key: string
): Promise<{ success: boolean; data?: T; error?: string; notFound?: boolean }> {
  const result = await downloadData(client, bucket, key);

  if (!result.success) {
    return {
      success: false,
      error: result.error,
      notFound: result.notFound,
    };
  }

  try {
    const parsed = JSON.parse(result.data!) as T;
    return {
      success: true,
      data: parsed,
    };
  } catch {
    return {
      success: false,
      error: "Failed to parse JSON data",
    };
  }
}
