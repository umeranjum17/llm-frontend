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
    const url = `${this.endpoint}/${this.bucket}/${key}`;
    const date = new Date().toUTCString();

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Date: date,
        Authorization: await this.getAuthHeader("PUT", key, date),
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload to S3: ${response.statusText}`);
    }
  }

  /**
   * GET an object from S3
   */
  private async getObject(key: string): Promise<string> {
    const url = `${this.endpoint}/${this.bucket}/${key}`;
    const date = new Date().toUTCString();

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Date: date,
        Authorization: await this.getAuthHeader("GET", key, date),
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Not found");
      }
      throw new Error(`Failed to download from S3: ${response.statusText}`);
    }

    return response.text();
  }

  /**
   * List objects in S3 with a prefix
   */
  private async listObjects(prefix: string): Promise<Array<{ key: string }>> {
    const url = `${this.endpoint}/${this.bucket}?list-type=2&prefix=${encodeURIComponent(prefix)}`;
    const date = new Date().toUTCString();

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Date: date,
        Authorization: await this.getAuthHeader("GET", "", date, `?list-type=2&prefix=${encodeURIComponent(prefix)}`),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list S3 objects: ${response.statusText}`);
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
   */
  private async getAuthHeader(
    method: string,
    key: string,
    date: string,
    queryString = ""
  ): Promise<string> {
    // For simplicity, using a basic S3 auth
    // In production, use AWS SDK or a proper signing library
    const path = `/${this.bucket}/${key}${queryString}`;
    const stringToSign = `${method}\n\n\n${date}\n${path}`;

    const signature = await this.hmacSha1(this.secretAccessKey, stringToSign);
    return `AWS ${this.accessKeyId}:${signature}`;
  }

  /**
   * HMAC-SHA1 signature
   */
  private async hmacSha1(key: string, message: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const messageData = encoder.encode(message);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  }
}
