const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();
const publicDir = path.join(projectRoot, "public");
const datasetRoot = path.join(publicDir, "gui_selected_650");
const legacyDataRoot = path.join(publicDir, "data");
const datasetAccessCodePath = path.join(datasetRoot, "access_code.csv");
const legacyAccessCodePath = path.join(legacyDataRoot, "access_code.csv");

function readCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8").trim();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];

  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    return Object.fromEntries(
      headers.map((header, index) => [header, cols[index] ?? ""])
    );
  });
}

function writeCsv(filePath, headers, rows) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => String(row[header] ?? "")).join(","));
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function listPatientFolders(root) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^patient_\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => {
      const aNum = Number(a.replace("patient_", ""));
      const bNum = Number(b.replace("patient_", ""));
      return aNum - bNum;
    });
}

function readCaseId(folderName) {
  const caseIdPath = path.join(datasetRoot, folderName, "case_id.txt");
  if (!fs.existsSync(caseIdPath)) return "";
  return fs.readFileSync(caseIdPath, "utf8").trim();
}

function main() {
  if (!fs.existsSync(datasetRoot)) {
    throw new Error(`Dataset root not found: ${datasetRoot}`);
  }

  const accessCodePath = fs.existsSync(datasetAccessCodePath)
    ? datasetAccessCodePath
    : legacyAccessCodePath;

  if (!fs.existsSync(accessCodePath)) {
    throw new Error(`No access_code.csv source found at ${datasetAccessCodePath} or ${legacyAccessCodePath}`);
  }

  const doctors = readCsv(accessCodePath).filter(
    (row) => String(row.is_active ?? "1").trim() !== "0"
  );

  if (doctors.length === 0) {
    throw new Error("No active doctors found in legacy access_code.csv");
  }

  const patientFolders = listPatientFolders(datasetRoot);
  if (patientFolders.length === 0) {
    throw new Error("No patient_* folders found in gui_selected_650");
  }

  const assignmentHeaders = [
    "patient_folder",
    "case_id",
    "group_id",
    "doctor_id",
    "group_order",
    "status",
    "annotated_at",
    "note",
    "is_active",
  ];

  const groupedRows = new Map();
  const groupRows = new Map();
  const masterRows = [];

  doctors.forEach((doctor, index) => {
    const doctorId = String(doctor.doctor_id ?? "").trim();
    const groupId = `group_${String(index + 1).padStart(3, "0")}`;
    groupedRows.set(doctorId, []);
    groupRows.set(groupId, []);
  });

  patientFolders.forEach((patientFolder, index) => {
    const doctor = doctors[index % doctors.length];
    const doctorIndex = index % doctors.length;
    const doctorId = String(doctor.doctor_id ?? "").trim();
    const groupId = `group_${String(doctorIndex + 1).padStart(3, "0")}`;
    const doctorRows = groupedRows.get(doctorId);
    const nextOrder = doctorRows.length + 1;

    const row = {
      patient_folder: patientFolder,
      case_id: readCaseId(patientFolder),
      group_id: groupId,
      doctor_id: doctorId,
      group_order: nextOrder,
      status: "assigned",
      annotated_at: "",
      note: "",
      is_active: 1,
    };

    doctorRows.push(row);
    groupRows.get(groupId).push(row);
    masterRows.push(row);
  });

  writeCsv(
    path.join(datasetRoot, "access_code.csv"),
    Object.keys(doctors[0]),
    doctors
  );
  writeCsv(
    path.join(datasetRoot, "assignment_master.csv"),
    assignmentHeaders,
    masterRows
  );
  writeCsv(
    path.join(datasetRoot, "assignment.csv"),
    assignmentHeaders,
    masterRows
  );

  for (const [doctorId, rows] of groupedRows.entries()) {
    writeCsv(
      path.join(datasetRoot, "assignments_by_doctor", `${doctorId}.csv`),
      assignmentHeaders,
      rows
    );
  }

  for (const [groupId, rows] of groupRows.entries()) {
    writeCsv(
      path.join(datasetRoot, "assignments_by_group", `${groupId}.csv`),
      assignmentHeaders,
      rows
    );
  }

  console.log(
    `Prepared gui_selected_650 metadata for ${patientFolders.length} patients across ${doctors.length} doctors.`
  );
}

main();
