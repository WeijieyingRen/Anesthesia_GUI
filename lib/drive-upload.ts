import { createSign } from "node:crypto";
import fs from "node:fs/promises";

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
};

type DriveFile = {
  id: string;
  name?: string;
  webViewLink?: string;
};

type DriveUploadResult = {
  fileId: string;
  fileName: string;
  folderId: string;
  objectPath: string;
  webViewLink?: string;
};

export type DriveJsonReadResult = {
  fileId: string;
  fileName: string;
  objectPath: string;
  data: Record<string, unknown>;
  webViewLink?: string;
};

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

/**
 * Use full Drive scope instead of drive.file.
 *
 * drive.file can be too restrictive for Shared Drive workflows,
 * especially when the service account needs to search existing folders,
 * create nested folders, and update existing JSON files.
 */
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

let accessTokenPromise: Promise<string> | null = null;

function isTruthyEnv(value: string | undefined): boolean {
  return ["true", "1", "yes", "y", "on"].includes(
    String(value ?? "").trim().toLowerCase()
  );
}

export function isDriveUploadEnabled(): boolean {
  return isTruthyEnv(process.env.DRIVE_ENABLED);
}

function base64Url(value: string | Buffer): string {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);

  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function sanitizeDrivePathPart(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|#%{}]/g, "_") || "unknown";
}

async function loadServiceAccountCredentials(): Promise<ServiceAccountCredentials> {
  const inlineKey = process.env.DRIVE_SERVICE_ACCOUNT_KEY;

  if (inlineKey?.trim()) {
    const parsed = JSON.parse(inlineKey) as ServiceAccountCredentials;

    if (!parsed.client_email || !parsed.private_key) {
      throw new Error(
        "DRIVE_SERVICE_ACCOUNT_KEY is present but missing client_email or private_key."
      );
    }

    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, "\n"),
    };
  }

  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (keyPath?.trim()) {
    const raw = await fs.readFile(keyPath, "utf-8");
    const parsed = JSON.parse(raw) as ServiceAccountCredentials;

    if (!parsed.client_email || !parsed.private_key) {
      throw new Error(
        "GOOGLE_APPLICATION_CREDENTIALS file is missing client_email or private_key."
      );
    }

    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, "\n"),
    };
  }

  throw new Error(
    "Drive upload is enabled but DRIVE_SERVICE_ACCOUNT_KEY or GOOGLE_APPLICATION_CREDENTIALS is missing."
  );
}

async function getDriveAccessToken(): Promise<string> {
  if (accessTokenPromise) return accessTokenPromise;

  accessTokenPromise = (async () => {
    const credentials = await loadServiceAccountCredentials();

    if (!credentials.client_email || !credentials.private_key) {
      throw new Error("Invalid Drive service account credentials.");
    }

    const now = Math.floor(Date.now() / 1000);

    const header = base64Url(
      JSON.stringify({
        alg: "RS256",
        typ: "JWT",
      })
    );

    const payload = base64Url(
      JSON.stringify({
        iss: credentials.client_email,
        scope: DRIVE_SCOPE,
        aud: "https://oauth2.googleapis.com/token",
        exp: now + 3600,
        iat: now,
      })
    );

    const unsignedJwt = `${header}.${payload}`;

    const signature = createSign("RSA-SHA256")
      .update(unsignedJwt)
      .sign(credentials.private_key);

    const assertion = `${unsignedJwt}.${base64Url(signature)}`;

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      accessTokenPromise = null;
      throw new Error(`Failed to get Drive access token: ${errorText}`);
    }

    const tokenJson = (await tokenResponse.json()) as {
      access_token?: string;
    };

    if (!tokenJson.access_token) {
      accessTokenPromise = null;
      throw new Error("Google token response did not include access_token.");
    }

    return tokenJson.access_token;
  })();

  return accessTokenPromise;
}

async function driveRequest<T>(
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await getDriveAccessToken();

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();

    console.error("[Drive] API request failed:", {
      status: response.status,
      url,
      errorText,
    });

    throw new Error(
      `Drive API request failed (${response.status}): ${errorText}`
    );
  }

  return (await response.json()) as T;
}

async function findDriveFileByName(
  parentFolderId: string,
  name: string,
  mimeType?: string
): Promise<DriveFile | null> {
  const clauses = [
    `'${escapeDriveQueryValue(parentFolderId)}' in parents`,
    `name='${escapeDriveQueryValue(name)}'`,
    "trashed=false",
  ];

  if (mimeType) {
    clauses.push(`mimeType='${escapeDriveQueryValue(mimeType)}'`);
  }

  const params = new URLSearchParams({
    q: clauses.join(" and "),
    fields: "files(id,name,webViewLink)",
    pageSize: "1",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });

  const result = await driveRequest<{ files?: DriveFile[] }>(
    `${DRIVE_API}/files?${params.toString()}`
  );

  return result.files?.[0] ?? null;
}

async function getDriveFileJson(fileId: string): Promise<Record<string, unknown>> {
  const token = await getDriveAccessToken();
  const response = await fetch(
    `${DRIVE_API}/files/${fileId}?alt=media&supportsAllDrives=true`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Drive file download failed (${response.status}): ${errorText}`
    );
  }

  return (await response.json()) as Record<string, unknown>;
}

async function createDriveFolder(
  parentFolderId: string,
  name: string
): Promise<DriveFile> {
  console.log("[Drive] creating folder:", {
    parentFolderId,
    name,
  });

  return driveRequest<DriveFile>(`${DRIVE_API}/files?supportsAllDrives=true`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME_TYPE,
      parents: [parentFolderId],
    }),
  });
}

async function ensureDriveFolderPath(
  rootFolderId: string,
  folderParts: string[]
): Promise<string> {
  let currentFolderId = rootFolderId;

  for (const rawPart of folderParts) {
    const part = sanitizeDrivePathPart(rawPart);

    const existing = await findDriveFileByName(
      currentFolderId,
      part,
      FOLDER_MIME_TYPE
    );

    if (existing) {
      currentFolderId = existing.id;
      continue;
    }

    const created = await createDriveFolder(currentFolderId, part);
    currentFolderId = created.id;
  }

  return currentFolderId;
}

function buildMultipartBody(
  metadata: Record<string, unknown>,
  jsonData: Record<string, unknown>
): { body: string; contentType: string } {
  const boundary = `drive_upload_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;

  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(jsonData, null, 2),
    `--${boundary}--`,
    "",
  ].join("\r\n");

  return {
    body,
    contentType: `multipart/related; boundary=${boundary}`,
  };
}

async function upsertDriveJsonFile(
  parentFolderId: string,
  fileName: string,
  data: Record<string, unknown>
): Promise<DriveFile> {
  const existing = await findDriveFileByName(parentFolderId, fileName);

  const metadata: Record<string, unknown> = {
    name: fileName,
    mimeType: "application/json",
  };

  if (!existing) {
    metadata.parents = [parentFolderId];
  }

  const multipart = buildMultipartBody(metadata, data);

  if (existing) {
    console.log("[Drive] updating existing JSON file:", {
      fileId: existing.id,
      fileName,
      parentFolderId,
    });

    return driveRequest<DriveFile>(
      `${DRIVE_UPLOAD_API}/files/${existing.id}?uploadType=multipart&fields=id,name,webViewLink&supportsAllDrives=true`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": multipart.contentType,
        },
        body: multipart.body,
      }
    );
  }

  console.log("[Drive] creating new JSON file:", {
    fileName,
    parentFolderId,
  });

  return driveRequest<DriveFile>(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,webViewLink&supportsAllDrives=true`,
    {
      method: "POST",
      headers: {
        "Content-Type": multipart.contentType,
      },
      body: multipart.body,
    }
  );
}

export async function uploadJsonToDrive({
  objectPath,
  data,
}: {
  objectPath: string;
  data: Record<string, unknown>;
}): Promise<DriveUploadResult> {
  const rootFolderId = process.env.DRIVE_FOLDER_ID;

  console.log("[Drive] uploadJsonToDrive called:", {
    enabled: process.env.DRIVE_ENABLED,
    rootFolderId,
    objectPath,
    hasGoogleCredentials: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    hasInlineKey: Boolean(process.env.DRIVE_SERVICE_ACCOUNT_KEY),
  });

  if (!isDriveUploadEnabled()) {
    throw new Error("DRIVE_ENABLED is not true.");
  }

  if (!rootFolderId) {
    throw new Error("DRIVE_FOLDER_ID is missing.");
  }

  const pathParts = objectPath.split("/").filter(Boolean);
  const rawFileName = pathParts.pop() ?? "submission.json";
  const fileName = sanitizeDrivePathPart(rawFileName);

  const folderId = await ensureDriveFolderPath(rootFolderId, pathParts);
  const file = await upsertDriveJsonFile(folderId, fileName, data);

  console.log("[Drive] upload success:", {
    fileId: file.id,
    fileName,
    folderId,
    objectPath,
    webViewLink: file.webViewLink,
  });

  return {
    fileId: file.id,
    fileName,
    folderId,
    objectPath,
    webViewLink: file.webViewLink,
  };
}

export async function readJsonFromDrive({
  objectPath,
}: {
  objectPath: string;
}): Promise<DriveJsonReadResult | null> {
  const rootFolderId = process.env.DRIVE_FOLDER_ID;

  if (!isDriveUploadEnabled()) {
    throw new Error("DRIVE_ENABLED is not true.");
  }

  if (!rootFolderId) {
    throw new Error("DRIVE_FOLDER_ID is missing.");
  }

  const pathParts = objectPath.split("/").filter(Boolean);
  const rawFileName = pathParts.pop() ?? "submission.json";
  const fileName = sanitizeDrivePathPart(rawFileName);

  let currentFolderId = rootFolderId;
  for (const rawPart of pathParts) {
    const part = sanitizeDrivePathPart(rawPart);
    const existing = await findDriveFileByName(
      currentFolderId,
      part,
      FOLDER_MIME_TYPE
    );

    if (!existing) return null;
    currentFolderId = existing.id;
  }

  const file = await findDriveFileByName(currentFolderId, fileName);
  if (!file) return null;

  const data = await getDriveFileJson(file.id);

  return {
    fileId: file.id,
    fileName,
    objectPath,
    data,
    webViewLink: file.webViewLink,
  };
}
