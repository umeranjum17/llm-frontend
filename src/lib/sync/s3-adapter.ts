import type { ChangeEntry, SyncManifest } from "@/lib/db/schema";
import { getS3Config } from "./device-id";

/**
 * S3 adapter for delta sync
 * Handles upload/download of change logs and manifest
 */
export class S3Adapter {
  private endpoint: string;
  private accessKeyId: string;
  private secretAccessKey: string;
  private bucket: string;
  private region: string;

  constructor(config: {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    region?: string;
  }) {
    this.endpoint = config.endpoint;
    this.accessKeyId = config.accessKeyId;
    this.secretAccessKey = config.secretAccessKey;
    this.bucket = config.bucket;
    this.region = config.region || "us-east-1";
  }

  /**
   * Create an S3 adapter from stored config
   */
  static async fromConfig(): Promise<S3Adapter | null> {
    const config = await getS3Config();
    if (!config) {
      return null;
    }
    return new S3Adapter(config);
  }

  /**
   * Upload changes for this device
   */
  async uploadChanges(deviceId: string, changes: ChangeEntry[]): Promise<void> {
    if (changes.length === 0) return;

    const timestamp = Date.now();
    const key = `changes/${deviceId}/${timestamp}.json`;

    const body = JSON.stringify(changes);

    await this.putObject(key, body);
  }

  /**
   * Download changes from all devices since a timestamp
   */
  async downloadChanges(sinceTimestamp: number): Promise<ChangeEntry[]> {
    const allChanges: ChangeEntry[] = [];

    // List all change files
    const changeFiles = await this.listChangeFiles();

    // Filter files by timestamp and download
    for (const file of changeFiles) {
      // Extract timestamp from filename: changes/device-abc/1234567890.json
      const match = file.key.match(/\/(\d+)\.json$/);
      if (!match) continue;

      const fileTimestamp = parseInt(match[1], 10);
      if (fileTimestamp <= sinceTimestamp) continue;

      // Download and parse the file
      const content = await this.getObject(file.key);
      const changes = JSON.parse(content) as ChangeEntry[];
      allChanges.push(...changes);
    }

    // Sort by timestamp
    allChanges.sort((a, b) => a.timestamp - b.timestamp);

    return allChanges;
  }

  /**
   * Get the sync manifest
   */
  async getManifest(): Promise<SyncManifest> {
    try {
      const content = await this.getObject("manifest.json");
      return JSON.parse(content);
    } catch (error) {
      // Return empty manifest if not found
      return { devices: {} };
    }
  }

  /**
   * Update the sync manifest
   */
  async updateManifest(manifest: SyncManifest): Promise<void> {
    const content = JSON.stringify(manifest, null, 2);
    await this.putObject("manifest.json", content);
  }

  /**
   * List all change files in S3
   */
  private async listChangeFiles(): Promise<Array<{ key: string }>> {
    const prefix = "changes/";
    return this.listObjects(prefix);
  }

  /**
   * PUT an object to S3
   */
  private async putObject(key: string, body: string): Promise<void> {
    // Check if endpoint already includes bucket (for path-style URLs)
    const url = this.endpoint.includes(this.bucket)
      ? `${this.endpoint}/${key}`
      : `${this.endpoint}/${this.bucket}/${key}`;
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const date = new Date().toUTCString();

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-amz-date": amzDate,
        "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
        Authorization: await this.getAuthHeader("PUT", key, date),
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[S3] PUT failed:`, {
        status: response.status,
        statusText: response.statusText,
        url,
        error: errorText
      });
      throw new Error(`Failed to upload to S3 (${response.status}): ${errorText || response.statusText}`);
    }
  }

  /**
   * GET an object from S3
   */
  private async getObject(key: string): Promise<string> {
    // Check if endpoint already includes bucket (for path-style URLs)
    const url = this.endpoint.includes(this.bucket)
      ? `${this.endpoint}/${key}`
      : `${this.endpoint}/${this.bucket}/${key}`;
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const date = new Date().toUTCString();

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-amz-date": amzDate,
        "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
        Authorization: await this.getAuthHeader("GET", key, date),
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Not found");
      }
      const errorText = await response.text();
      throw new Error(`Failed to download from S3 (${response.status}): ${errorText || response.statusText}`);
    }

    return response.text();
  }

  /**
   * List objects in S3 with a prefix
   */
  private async listObjects(prefix: string): Promise<Array<{ key: string }>> {
    // Check if endpoint already includes bucket (for path-style URLs)
    const url = this.endpoint.includes(this.bucket)
      ? `${this.endpoint}?list-type=2&prefix=${encodeURIComponent(prefix)}`
      : `${this.endpoint}/${this.bucket}?list-type=2&prefix=${encodeURIComponent(prefix)}`;
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const date = new Date().toUTCString();

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-amz-date": amzDate,
        "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
        Authorization: await this.getAuthHeader("GET", "", date, `?list-type=2&prefix=${encodeURIComponent(prefix)}`),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[S3] LIST failed:`, {
        status: response.status,
        statusText: response.statusText,
        url,
        error: errorText
      });
      throw new Error(`Failed to list S3 objects (${response.status}): ${errorText || response.statusText}`);
    }

    const text = await response.text();

    // Parse XML response
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, "text/xml");
    const contents = xml.getElementsByTagName("Contents");

    const files: Array<{ key: string }> = [];
    for (let i = 0; i < contents.length; i++) {
      const keyElement = contents[i].getElementsByTagName("Key")[0];
      if (keyElement) {
        files.push({ key: keyElement.textContent || "" });
      }
    }

    return files;
  }

  /**
   * Generate AWS Signature Version 4 authorization header
   * R2 requires SigV4, not the older SigV2
   */
  private async getAuthHeader(
    method: string,
    key: string,
    date: string,
    queryString = ""
  ): Promise<string> {
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.substring(0, 8);
    const service = "s3";

    // Canonical request
    // For bucket-level operations (empty key), don't add trailing slash
    let canonicalUri = key ? `/${this.bucket}/${key}` : `/${this.bucket}`;
    // URI encode the path (but not the slashes)
    canonicalUri = canonicalUri.split('/').map(segment =>
      segment ? encodeURIComponent(segment) : ''
    ).join('/');
    const canonicalQueryString = queryString.replace(/^\?/, "");
    const canonicalHeaders = `host:${new URL(this.endpoint).host}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-date";
    const payloadHash = "UNSIGNED-PAYLOAD";

    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    // Debug logging
    if (process.env.NODE_ENV === 'development') {
      console.log('[S3Auth] Canonical Request:', {
        method,
        canonicalUri,
        canonicalQueryString,
        amzDate,
        region: this.region
      });
    }

    // String to sign
    const algorithm = "AWS4-HMAC-SHA256";
    const credentialScope = `${dateStamp}/${this.region}/${service}/aws4_request`;
    const canonicalRequestHash = await this.sha256(canonicalRequest);
    const stringToSign = [
      algorithm,
      amzDate,
      credentialScope,
      canonicalRequestHash,
    ].join("\n");

    // Signing key
    const signingKey = await this.getSignatureKey(
      this.secretAccessKey,
      dateStamp,
      this.region,
      service
    );

    // Signature
    const signature = await this.hmacSha256Hex(signingKey, stringToSign);

    // Authorization header
    return `${algorithm} Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  }

  /**
   * SHA256 hash
   */
  private async sha256(message: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * HMAC-SHA256
   */
  private async hmacSha256(
    key: string | Uint8Array,
    message: string
  ): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const keyData = typeof key === "string" ? encoder.encode(key) : key;
    const messageData = encoder.encode(message);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
    return new Uint8Array(signature);
  }

  /**
   * HMAC-SHA256 as hex string
   */
  private async hmacSha256Hex(
    key: Uint8Array,
    message: string
  ): Promise<string> {
    const signature = await this.hmacSha256(key, message);
    return Array.from(signature)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Get AWS SigV4 signing key
   */
  private async getSignatureKey(
    secretKey: string,
    dateStamp: string,
    region: string,
    service: string
  ): Promise<Uint8Array> {
    const kDate = await this.hmacSha256("AWS4" + secretKey, dateStamp);
    const kRegion = await this.hmacSha256(kDate, region);
    const kService = await this.hmacSha256(kRegion, service);
    const kSigning = await this.hmacSha256(kService, "aws4_request");
    return kSigning;
  }
}
