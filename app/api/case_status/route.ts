import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import {
  listDriveEntries,
  readJsonFromDrive,
  type DriveJsonReadResult,
} from "@/lib/drive-upload";

type AccessCodeRow = {
  doctor_id?: string;
  access_code?: string;
};

type CaseStatusIndexEntry = {
  patient_id?: string;
  case_id?: string | number | null;
  inProgress?: boolean;
  completed?: boolean;
  updated_at?: string;
  completed_at?: string | null;
  last_panel?: string;
};

function sanitizePathPart(value: unknown): string {
  if (value === null || value === undefined) return "unknown";
  return String(value).trim().replace(/[^\w.-]/g, "_") || "unknown";
}

let accessCodeDoctorMapPromise: Promise<Map<string, string>> | null = null;

async function loadAccessCodeDoctorMap(): Promise<Map<string, string>> {
  if (accessCodeDoctorMapPromise) return accessCodeDoctorMapPromise;

  accessCodeDoctorMapPromise = (async () => {
    const csvPath = path.join(
      process.cwd(),
      "public",
      "data",
      "access_code.csv"
    );

    const raw = await fs.readFile(csvPath, "utf-8");
    const lines = raw.split(/\r?\n/).filter(Boolean);

    const map = new Map<string, string>();
    if (lines.length < 2) return map;

    const header = lines[0].split(",");
    const doctorIdx = header.indexOf("doctor_id");
    const codeIdx = header.indexOf("access_code");

    if (doctorIdx < 0 || codeIdx < 0) return map;

    for (const line of lines.slice(1)) {
      const cols = line.split(",");

      const row: AccessCodeRow = {
        doctor_id: cols[doctorIdx],
        access_code: cols[codeIdx],
      };

      const code = String(row.access_code ?? "").trim();
      const doctor = String(row.doctor_id ?? "").trim();

      if (code && doctor) {
        map.set(code, doctor);
      }
    }

    return map;
  })();

  return accessCodeDoctorMapPromise;
}

async function resolveDoctorIdFromAccessCode(
  accessCode: string | null | undefined
): Promise<string | null> {
  if (!accessCode) return null;

  try {
    const map = await loadAccessCodeDoctorMap();
    return map.get(String(accessCode).trim()) ?? null;
  } catch (error) {
    console.error("Failed to resolve doctor_id from access_code.csv:", error);
    return null;
  }
}

function buildCombinedDoctorFolder(doctorFolderName: string, accessCode: string) {
  return `${doctorFolderName}_${sanitizePathPart(accessCode)}`;
}

function buildNestedDoctorFolder(doctorFolderName: string, accessCode: string) {
  return `${doctorFolderName}/${sanitizePathPart(accessCode)}`;
}

function extractPatients(
  found: DriveJsonReadResult | null
): Record<string, CaseStatusIndexEntry> {
  if (!found?.data?.patients || typeof found.data.patients !== "object") {
    return {};
  }

  return found.data.patients as Record<string, CaseStatusIndexEntry>;
}

function mergePatientStatus(
  current: CaseStatusIndexEntry | undefined,
  incoming: CaseStatusIndexEntry
): CaseStatusIndexEntry {
  if (!current) return incoming;

  const currentUpdatedAt = String(current.updated_at ?? "");
  const incomingUpdatedAt = String(incoming.updated_at ?? "");
  const incomingIsNewer = incomingUpdatedAt > currentUpdatedAt;

  return {
    ...current,
    ...incoming,
    inProgress:
      Boolean(current.inProgress) || Boolean(incoming.inProgress),
    completed:
      Boolean(current.completed) || Boolean(incoming.completed),
    updated_at: incomingIsNewer
      ? incoming.updated_at ?? current.updated_at
      : current.updated_at ?? incoming.updated_at,
    completed_at:
      current.completed_at ?? incoming.completed_at ?? null,
    last_panel: incomingIsNewer
      ? incoming.last_panel ?? current.last_panel
      : current.last_panel ?? incoming.last_panel,
    case_id: current.case_id ?? incoming.case_id ?? null,
    patient_id: current.patient_id ?? incoming.patient_id,
  };
}

async function readExistingIndexes(
  accessCode: string,
  doctorId: string,
  doctorName: string
) {
  const sanitizedAccessCode = sanitizePathPart(accessCode);
  const folderNames = [
    sanitizePathPart(doctorName || doctorId),
    sanitizePathPart(doctorId),
  ].filter(Boolean);

  const candidatePaths = new Set<string>();

  for (const folderName of folderNames) {
    candidatePaths.add(
      `${buildNestedDoctorFolder(folderName, sanitizedAccessCode)}/case_status_index.json`
    );
    candidatePaths.add(
      `${buildCombinedDoctorFolder(folderName, sanitizedAccessCode)}/case_status_index.json`
    );
  }

  try {
    const rootEntries = await listDriveEntries();

    for (const entry of rootEntries) {
      if (!entry.name) continue;

      if (entry.name.endsWith(`_${sanitizedAccessCode}`)) {
        candidatePaths.add(`${entry.name}/case_status_index.json`);
      }

      const nestedFolderEntries = await listDriveEntries({
        objectPath: entry.name,
      });
      if (
        nestedFolderEntries.some(
          (child) => child.name === sanitizedAccessCode
        )
      ) {
        candidatePaths.add(
          `${entry.name}/${sanitizedAccessCode}/case_status_index.json`
        );
      }
    }
  } catch (error) {
    console.error("Failed to enumerate Drive folders for case status:", error);
  }

  const foundIndexes: DriveJsonReadResult[] = [];

  for (const objectPath of candidatePaths) {
    try {
      const found = await readJsonFromDrive({ objectPath });
      if (!found) continue;

      const matchesDoctor =
        String(found.data?.doctor_id ?? "").trim() === doctorId;
      const matchesAccessCode =
        String(found.data?.access_code ?? "").trim() === accessCode;

      if (matchesDoctor && matchesAccessCode) {
        foundIndexes.push(found);
      }
    } catch (error) {
      console.error(`Failed to read Drive index ${objectPath}:`, error);
    }
  }

  return foundIndexes;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const accessCode = String(searchParams.get("accessCode") ?? "").trim();
    const doctorName = String(searchParams.get("doctorName") ?? "").trim();

    if (!accessCode) {
      return NextResponse.json(
        { ok: false, error: "Missing accessCode." },
        { status: 400 }
      );
    }

    const doctorId = await resolveDoctorIdFromAccessCode(accessCode);

    if (!doctorId) {
      return NextResponse.json(
        { ok: false, error: "Invalid accessCode or doctor not found." },
        { status: 404 }
      );
    }

    const foundIndexes = await readExistingIndexes(
      accessCode,
      doctorId,
      doctorName
    );

    const mergedPatients: Record<string, CaseStatusIndexEntry> = {};
    for (const found of foundIndexes) {
      const patients = extractPatients(found);

      for (const [patientId, entry] of Object.entries(patients)) {
        mergedPatients[patientId] = mergePatientStatus(
          mergedPatients[patientId],
          entry
        );
      }
    }

    return NextResponse.json({
      ok: true,
      found: foundIndexes.length > 0,
      source: foundIndexes.length > 0 ? "google_drive_merged" : "none",
      doctorId,
      accessCode,
      patients: mergedPatients,
      matchedIndexes: foundIndexes.map((entry) => entry.objectPath),
    });
  } catch (error) {
    console.error("case_status GET error:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to read case status.",
      },
      { status: 500 }
    );
  }
}
