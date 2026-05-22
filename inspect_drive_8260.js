const fs = require("fs");
const crypto = require("crypto");

function loadEnv(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const entries = lines
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf("=");
      return [line.slice(0, idx), line.slice(idx + 1)];
    });
  return Object.fromEntries(entries);
}

function base64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function getAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: credentials.client_email,
      scope: "https://www.googleapis.com/auth/drive",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );
  const unsignedJwt = `${header}.${payload}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsignedJwt)
    .sign(credentials.private_key);
  const assertion = `${unsignedJwt}.${base64Url(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(JSON.stringify(json));
  }

  return json.access_token;
}

async function driveList(token, parentId) {
  const q = `'${parentId}' in parents and trashed=false`;
  const url =
    "https://www.googleapis.com/drive/v3/files?" +
    new URLSearchParams({
      q,
      includeItemsFromAllDrives: "true",
      supportsAllDrives: "true",
      corpora: "allDrives",
      fields: "files(id,name,mimeType)",
      pageSize: "1000",
    });

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(JSON.stringify(json));
  }
  return json.files || [];
}

async function driveReadJson(token, fileId) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const json = await response.json();
  if (!response.ok) {
    throw new Error(JSON.stringify(json));
  }
  return json;
}

async function main() {
  const env = loadEnv(".env.local");
  const credentials = JSON.parse(
    fs.readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS, "utf8")
  );
  const token = await getAccessToken(credentials);
  const rootEntries = await driveList(token, env.DRIVE_FOLDER_ID);
  const matches = rootEntries.filter((entry) => entry.name?.includes("8260"));

  console.log("ROOT MATCHES");
  console.log(JSON.stringify(matches, null, 2));

  for (const entry of matches) {
    const children = await driveList(token, entry.id);
    const index = children.find((child) => child.name === "case_status_index.json");
    console.log(`\nFOLDER ${entry.name}`);
    console.log(JSON.stringify(children.map((child) => child.name), null, 2));
    if (index) {
      const data = await driveReadJson(token, index.id);
      console.log("INDEX");
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
