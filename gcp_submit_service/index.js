import express from "express";
import cors from "cors";
import { Storage } from "@google-cloud/storage";

console.log("[boot] index.js loaded");

const app = express();
const port = process.env.PORT || 8080;

console.log("[boot] PORT =", port);
console.log("[boot] GCS_BUCKET =", process.env.GCS_BUCKET ?? "(missing)");

app.use(cors());
app.use(express.json({ limit: "20mb" }));

const storage = new Storage();
const bucketName = process.env.GCS_BUCKET;

function sanitizePathPart(value) {
  if (value === null || value === undefined) return "unknown";
  return String(value).trim().replace(/[^\w.-]/g, "_") || "unknown";
}

function buildDoctorFolder(doctorId, accessCode) {
  return `${sanitizePathPart(doctorId)}_${sanitizePathPart(accessCode)}`;
}

function normalizeDoctorId(body) {
  return sanitizePathPart(
    body?.doctorId ??
      body?.participantInfo?.doctorId ??
      "unknown_doctor"
  );
}

function normalizeAccessCode(body) {
  return sanitizePathPart(
    body?.accessCode ??
      body?.participantInfo?.accessCode ??
      "unknown_code"
  );
}

function normalizePatientId(body) {
  return sanitizePathPart(
    body?.patientId ??
      body?.patientFolder ??
      body?.caseId ??
      "unknown_patient"
  );
}

function normalizeEpisodeFolder(body) {
  const explicitEpisodeFolder = body?.episodeFolder;
  if (explicitEpisodeFolder) {
    return sanitizePathPart(explicitEpisodeFolder);
  }

  const episodeNumber = body?.episodeNumber;
  if (
    episodeNumber !== null &&
    episodeNumber !== undefined &&
    String(episodeNumber).trim() !== ""
  ) {
    const n = Number(episodeNumber);
    if (Number.isFinite(n) && n > 0) {
      return `episode_${Math.floor(n)}`;
    }
  }

  const raw =
    body?.episodeId ??
    body?.selectedEventId ??
    body?.eventId ??
    "episode_unknown";

  return sanitizePathPart(raw);
}

function detectStorageTarget(body) {
  const panel = String(body?.panel ?? "").toLowerCase();
  const action = String(body?.action ?? "").toLowerCase();
  const task = String(body?.task ?? "").toLowerCase();
  const combined = `${panel} ${action} ${task}`;

  const hasAnnotationState =
    body?.annotationState &&
    typeof body.annotationState === "object" &&
    !Array.isArray(body.annotationState);

  if (hasAnnotationState && !panel && !task) {
    return {
      section: "case_submission",
      fileName: "final_submission.json",
    };
  }

  if (combined.includes("summary")) {
    return {
      section: "summary",
      fileName: "summary.json",
    };
  }

  if (
    combined.includes("selection_overview") ||
    combined.includes("abnormality_reasoning_selection") ||
    combined.includes("checklist")
  ) {
    return {
      section: "abnormality_reasoning_selection",
      fileName: "selection_overview.json",
    };
  }

  if (combined.includes("management")) {
    return {
      section: "management_reasoning",
      fileName: "management_reasoning.json",
    };
  }

  if (combined.includes("detect")) {
    return {
      section: "abnormality_reasoning",
      taskFolder: "detection",
      episodeFolder: normalizeEpisodeFolder(body),
      fileName: "detection.json",
    };
  }

  if (combined.includes("mechanism")) {
    return {
      section: "abnormality_reasoning",
      taskFolder: "mechanism",
      episodeFolder: normalizeEpisodeFolder(body),
      fileName: "mechanism.json",
    };
  }

  if (combined.includes("intervention") || combined.includes("fluideval")) {
    return {
      section: "abnormality_reasoning",
      taskFolder: "intervention",
      episodeFolder: normalizeEpisodeFolder(body),
      fileName: "intervention.json",
    };
  }

  return {
    section: "misc",
    fileName: "submission.json",
  };
}

function buildObjectPath(body) {
  const doctorId = normalizeDoctorId(body);
  const accessCode = normalizeAccessCode(body);
  const patientId = normalizePatientId(body);
  const doctorFolder = buildDoctorFolder(doctorId, accessCode);
  const target = detectStorageTarget(body);

  if (target.section === "summary") {
    return `${doctorFolder}/${patientId}/summary/${target.fileName}`;
  }

  if (target.section === "management_reasoning") {
    return `${doctorFolder}/${patientId}/management_reasoning/${target.fileName}`;
  }

  if (target.section === "abnormality_reasoning_selection") {
    return `${doctorFolder}/${patientId}/abnormality_reasoning/selection_overview/${target.fileName}`;
  }

  if (target.section === "case_submission") {
    return `${doctorFolder}/${patientId}/case_submission/${target.fileName}`;
  }

  if (target.section === "abnormality_reasoning") {
    return `${doctorFolder}/${patientId}/abnormality_reasoning/${target.episodeFolder}/${target.taskFolder}/${target.fileName}`;
  }

  return `${doctorFolder}/${patientId}/misc/${target.fileName}`;
}

async function saveJson(objectName, data) {
  if (!bucketName) {
    throw new Error("GCS_BUCKET is not configured.");
  }

  const bucket = storage.bucket(bucketName);
  await bucket.file(objectName).save(JSON.stringify(data, null, 2), {
    contentType: "application/json",
    resumable: false,
    metadata: {
      cacheControl: "no-store",
    },
  });
}

async function readJsonIfExists(objectName) {
  if (!bucketName) {
    throw new Error("GCS_BUCKET is not configured.");
  }

  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  const [exists] = await file.exists();

  if (!exists) return null;

  const [buf] = await file.download();
  return JSON.parse(buf.toString("utf-8"));
}

function isFinalCaseSubmission(body) {
  const hasAnnotationState =
    body?.annotationState &&
    typeof body.annotationState === "object" &&
    !Array.isArray(body.annotationState);

  return Boolean(hasAnnotationState && body?.caseId);
}

async function writeCaseStatusToGCS(body) {
  const annotationState =
    body?.annotationState && typeof body.annotationState === "object"
      ? body.annotationState
      : null;

  if (!annotationState) return null;

  const doctorId = normalizeDoctorId(body);
  const accessCode = normalizeAccessCode(body);
  const patientId = normalizePatientId(body);
  const doctorFolder = buildDoctorFolder(doctorId, accessCode);

  const patientSummaryCompleted = Boolean(
    annotationState.patientSummaryCompleted
  );
  const managementReasoningCompleted = Boolean(
    annotationState.managementReasoningCompleted
  );

  const episodeWorkflow =
    annotationState.episodeWorkflow &&
    typeof annotationState.episodeWorkflow === "object"
      ? annotationState.episodeWorkflow
      : null;

  const episodeTaskCompletion =
    annotationState.episodeTaskCompletion &&
    typeof annotationState.episodeTaskCompletion === "object"
      ? annotationState.episodeTaskCompletion
      : {};

  const prioritizedEpisodeIds = Array.isArray(
    episodeWorkflow?.prioritizedEpisodeIds
  )
    ? episodeWorkflow.prioritizedEpisodeIds
    : [];

  const abnormalityReasoningCompleted =
    prioritizedEpisodeIds.length > 0 &&
    prioritizedEpisodeIds.every((episodeId) => {
      const completed = episodeTaskCompletion?.[episodeId];
      return Boolean(
        completed?.detect && completed?.mechanism && completed?.fluidEval
      );
    });

  const finalSubmitted =
    patientSummaryCompleted &&
    managementReasoningCompleted &&
    abnormalityReasoningCompleted;

  const objectName = `${doctorFolder}/${patientId}/case_status.json`;

  const statusRecord = {
    doctor_id: doctorId,
    access_code: accessCode,
    patient_id: patientId,
    case_id: body.caseId ?? null,
    summary_completed: patientSummaryCompleted,
    management_reasoning_completed: managementReasoningCompleted,
    abnormality_reasoning_completed: abnormalityReasoningCompleted,
    final_submitted: finalSubmitted,
    prioritized_episode_count: prioritizedEpisodeIds.length,
    updated_at: new Date().toISOString(),
  };

  await saveJson(objectName, statusRecord);
  return objectName;
}

app.get("/health", async (_req, res) => {
  res.json({ ok: true, service: "gcp-submit-service" });
});

app.post("/submit", async (req, res) => {
  try {
    const body = req.body;
    const objectName = buildObjectPath(body);

    const payload = {
      ...body,
      saved_at: new Date().toISOString(),
    };

    await saveJson(objectName, payload);

    let caseStatusObjectName = null;
    if (isFinalCaseSubmission(body)) {
      caseStatusObjectName = await writeCaseStatusToGCS(body);
    }

    res.json({
      ok: true,
      objectName,
      caseStatusObjectName,
    });
  } catch (error) {
    console.error("POST /submit error:", error);
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Submit failed.",
    });
  }
});

app.get("/case_status", async (req, res) => {
  try {
    const accessCode = String(req.query.accessCode ?? "").trim();
    const patientId = String(req.query.patientId ?? "").trim();
    const doctorId = String(req.query.doctorId ?? "").trim();

    if (!accessCode) {
      return res.status(400).json({ ok: false, error: "Missing accessCode." });
    }
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "Missing patientId." });
    }
    if (!doctorId) {
      return res.status(400).json({ ok: false, error: "Missing doctorId." });
    }

    const doctorFolder = buildDoctorFolder(doctorId, accessCode);
    const patientFolder = sanitizePathPart(patientId);
    const objectName = `${doctorFolder}/${patientFolder}/case_status.json`;

    const caseStatus = await readJsonIfExists(objectName);

    if (!caseStatus) {
      return res.json({
        ok: true,
        found: false,
        status: {
          completed: false,
          inProgress: false,
        },
        raw: null,
      });
    }

    return res.json({
      ok: true,
      found: true,
      status: {
        completed: Boolean(caseStatus.final_submitted),
        inProgress:
          !Boolean(caseStatus.final_submitted) &&
          (Boolean(caseStatus.summary_completed) ||
            Boolean(caseStatus.management_reasoning_completed) ||
            Boolean(caseStatus.abnormality_reasoning_completed)),
      },
      raw: caseStatus,
    });
  } catch (error) {
    console.error("GET /case_status error:", error);
    res.status(500).json({
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to read case status.",
    });
  }
});

const server = app.listen(port, () => {
  console.log(`[boot] gcp-submit-service listening on port ${port}`);
});

server.on("error", (err) => {
  console.error("[boot] listen error:", err);
});

process.on("uncaughtException", (err) => {
  console.error("[boot] uncaughtException:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("[boot] unhandledRejection:", err);
});