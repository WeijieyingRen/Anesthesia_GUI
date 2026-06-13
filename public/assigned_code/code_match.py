from pathlib import Path
import shutil
import pandas as pd


BASE_DIR = Path(__file__).resolve().parent

MOVER_ASSIGNMENT = (
    BASE_DIR / "assigned_mover_350_cases_by_access_code.csv"
)

MPOG_ASSIGNMENT = (
    BASE_DIR / "assigned_650_cases_by_access_code.csv"
)

MOVER_LOOKUP = (
    BASE_DIR / "mover_access_code_lookup_for_ui.csv"
)

MOVER_REVIEW = (
    BASE_DIR / "mover_access_review_code.csv"
)

BACKUP_FILE = (
    BASE_DIR / "assigned_mover_350_cases_by_access_code.backup.csv"
)


# ============================================================
# 1. Check required files
# ============================================================

for path in [MOVER_ASSIGNMENT, MPOG_ASSIGNMENT]:
    if not path.exists():
        raise FileNotFoundError(f"Missing required file: {path}")


# ============================================================
# 2. Repair missing newline after assignment_seed
# ============================================================

raw_text = MOVER_ASSIGNMENT.read_text(encoding="utf-8-sig")

broken_marker = "assignment_seeddoctor_"

if broken_marker in raw_text:
    if not BACKUP_FILE.exists():
        shutil.copy2(MOVER_ASSIGNMENT, BACKUP_FILE)

    raw_text = raw_text.replace(
        broken_marker,
        "assignment_seed\ndoctor_",
        1,
    )

    MOVER_ASSIGNMENT.write_text(
        raw_text,
        encoding="utf-8",
        newline="",
    )

    print("Fixed missing newline after assignment_seed.")
    print(f"Backup saved to: {BACKUP_FILE}")
else:
    print("Assignment header newline is already correct.")


# ============================================================
# 3. Read assignment files
# ============================================================

mover = pd.read_csv(
    MOVER_ASSIGNMENT,
    dtype=str,
    keep_default_na=False,
)

mpog = pd.read_csv(
    MPOG_ASSIGNMENT,
    dtype=str,
    keep_default_na=False,
)

mover.columns = mover.columns.str.strip()
mpog.columns = mpog.columns.str.strip()

required_columns = [
    "doctor_id",
    "annotation_code",
    "review_code",
    "case_order_within_doctor",
    "patient_folder",
    "case_id",
    "patient_id",
]

missing_mover_columns = [
    col for col in required_columns
    if col not in mover.columns
]

if missing_mover_columns:
    raise ValueError(
        "MOVER assignment is missing columns: "
        + ", ".join(missing_mover_columns)
    )

for col in required_columns:
    mover[col] = mover[col].astype(str).str.strip()

for col in ["annotation_code", "review_code"]:
    if col not in mpog.columns:
        raise ValueError(
            f"MPOG assignment is missing column: {col}"
        )

    mpog[col] = mpog[col].astype(str).str.strip()


# ============================================================
# 4. Validate MOVER assignment structure
# ============================================================

if len(mover) != 350:
    raise ValueError(
        f"Expected 350 MOVER rows, found {len(mover)}"
    )

if mover["doctor_id"].nunique() != 14:
    raise ValueError(
        "Expected 14 doctors, found "
        f"{mover['doctor_id'].nunique()}"
    )

cases_per_doctor = mover.groupby("doctor_id").size()

bad_case_counts = cases_per_doctor[
    cases_per_doctor != 25
]

if not bad_case_counts.empty:
    raise ValueError(
        "Some doctors do not have 25 cases:\n"
        f"{bad_case_counts.to_string()}"
    )

codes_per_doctor = (
    mover.groupby("doctor_id")
    .agg(
        n_annotation_codes=(
            "annotation_code",
            "nunique",
        ),
        n_review_codes=(
            "review_code",
            "nunique",
        ),
    )
)

bad_doctor_codes = codes_per_doctor[
    (codes_per_doctor["n_annotation_codes"] != 1)
    | (codes_per_doctor["n_review_codes"] != 1)
]

if not bad_doctor_codes.empty:
    raise ValueError(
        "Each doctor must have exactly one annotation code "
        "and one review code:\n"
        f"{bad_doctor_codes.to_string()}"
    )

if mover["case_id"].duplicated().any():
    duplicate_rows = mover[
        mover["case_id"].duplicated(keep=False)
    ].sort_values("case_id")

    raise ValueError(
        "Duplicate MOVER case_id values found:\n"
        f"{duplicate_rows.to_string(index=False)}"
    )

doctor_order_duplicate = mover.duplicated(
    subset=[
        "doctor_id",
        "case_order_within_doctor",
    ],
    keep=False,
)

if doctor_order_duplicate.any():
    raise ValueError(
        "Duplicate doctor/order combinations found:\n"
        + mover.loc[
            doctor_order_duplicate,
            [
                "doctor_id",
                "case_order_within_doctor",
                "patient_folder",
                "case_id",
            ],
        ].to_string(index=False)
    )

required_nonempty = [
    "doctor_id",
    "annotation_code",
    "review_code",
    "patient_folder",
    "case_id",
    "patient_id",
]

for col in required_nonempty:
    empty_rows = mover[col].eq("")

    if empty_rows.any():
        raise ValueError(
            f"Empty values found in MOVER column: {col}"
        )


# ============================================================
# 5. Validate all access codes
# ============================================================

mover_annotation_codes = set(
    mover["annotation_code"]
)

mover_review_codes = set(
    mover["review_code"]
)

mpog_annotation_codes = set(
    mpog["annotation_code"]
)

mpog_review_codes = set(
    mpog["review_code"]
)

mover_all_codes = (
    mover_annotation_codes
    | mover_review_codes
)

mpog_all_codes = (
    mpog_annotation_codes
    | mpog_review_codes
)

if len(mover_annotation_codes) != 14:
    raise ValueError(
        "MOVER annotation codes are not unique across doctors."
    )

if len(mover_review_codes) != 14:
    raise ValueError(
        "MOVER review codes are not unique across doctors."
    )

internal_overlap = (
    mover_annotation_codes
    & mover_review_codes
)

if internal_overlap:
    raise ValueError(
        "MOVER annotation/review code overlap found: "
        f"{sorted(internal_overlap)}"
    )

mpog_overlap = mover_all_codes & mpog_all_codes

if mpog_overlap:
    raise ValueError(
        "MOVER codes overlap with MPOG codes: "
        f"{sorted(mpog_overlap)}"
    )


# ============================================================
# 6. Build one-row-per-doctor source table
# ============================================================

doctor_codes = (
    mover[
        [
            "doctor_id",
            "annotation_code",
            "review_code",
        ]
    ]
    .drop_duplicates()
    .sort_values("doctor_id")
    .reset_index(drop=True)
)

assigned_counts = (
    mover.groupby("doctor_id")
    .size()
    .rename("n_assigned")
    .reset_index()
)

doctor_codes = doctor_codes.merge(
    assigned_counts,
    on="doctor_id",
    how="left",
    validate="one_to_one",
)


# ============================================================
# 7. Generate mover_access_review_code.csv
# ============================================================

review_output = doctor_codes[
    [
        "doctor_id",
        "annotation_code",
        "review_code",
        "n_assigned",
    ]
].copy()

review_output.to_csv(
    MOVER_REVIEW,
    index=False,
)


# ============================================================
# 8. Generate mover_access_code_lookup_for_ui.csv
# ============================================================

annotation_lookup = doctor_codes[
    [
        "doctor_id",
        "annotation_code",
        "n_assigned",
    ]
].copy()

annotation_lookup = annotation_lookup.rename(
    columns={
        "annotation_code": "access_code",
    }
)

annotation_lookup["workflowMode"] = "annotation"

annotation_lookup = annotation_lookup[
    [
        "access_code",
        "doctor_id",
        "workflowMode",
        "n_assigned",
    ]
]

review_lookup = doctor_codes[
    [
        "doctor_id",
        "review_code",
        "n_assigned",
    ]
].copy()

review_lookup = review_lookup.rename(
    columns={
        "review_code": "access_code",
    }
)

review_lookup["workflowMode"] = "review"

review_lookup = review_lookup[
    [
        "access_code",
        "doctor_id",
        "workflowMode",
        "n_assigned",
    ]
]

lookup_output = pd.concat(
    [
        annotation_lookup,
        review_lookup,
    ],
    ignore_index=True,
)

doctor_order = {
    doctor_id: index
    for index, doctor_id in enumerate(
        sorted(doctor_codes["doctor_id"])
    )
}

workflow_order = {
    "annotation": 0,
    "review": 1,
}

lookup_output["_doctor_order"] = (
    lookup_output["doctor_id"].map(doctor_order)
)

lookup_output["_workflow_order"] = (
    lookup_output["workflowMode"].map(workflow_order)
)

lookup_output = (
    lookup_output
    .sort_values(
        [
            "_doctor_order",
            "_workflow_order",
        ]
    )
    .drop(
        columns=[
            "_doctor_order",
            "_workflow_order",
        ]
    )
    .reset_index(drop=True)
)

lookup_output.to_csv(
    MOVER_LOOKUP,
    index=False,
)


# ============================================================
# 9. Final round-trip validation
# ============================================================

saved_review = pd.read_csv(
    MOVER_REVIEW,
    dtype=str,
    keep_default_na=False,
)

saved_lookup = pd.read_csv(
    MOVER_LOOKUP,
    dtype=str,
    keep_default_na=False,
)

expected_review = review_output.astype(str)
saved_review = saved_review.astype(str)

pd.testing.assert_frame_equal(
    saved_review.reset_index(drop=True),
    expected_review.reset_index(drop=True),
    check_dtype=False,
)

lookup_codes = set(
    saved_lookup["access_code"].str.strip()
)

if lookup_codes != mover_all_codes:
    raise ValueError(
        "Generated lookup codes do not exactly match "
        "the MOVER assignment codes."
    )

lookup_annotation = set(
    saved_lookup.loc[
        saved_lookup["workflowMode"] == "annotation",
        "access_code",
    ]
)

lookup_review = set(
    saved_lookup.loc[
        saved_lookup["workflowMode"] == "review",
        "access_code",
    ]
)

if lookup_annotation != mover_annotation_codes:
    raise ValueError(
        "Generated annotation lookup does not match "
        "the MOVER assignment."
    )

if lookup_review != mover_review_codes:
    raise ValueError(
        "Generated review lookup does not match "
        "the MOVER assignment."
    )


# ============================================================
# 10. Report
# ============================================================

print()
print("=" * 70)
print("ALL MOVER CODE FILES ARE NOW CONSISTENT")
print("=" * 70)

print(f"\nMOVER assignment:\n{MOVER_ASSIGNMENT}")
print(f"\nMOVER UI lookup:\n{MOVER_LOOKUP}")
print(f"\nMOVER review lookup:\n{MOVER_REVIEW}")

print("\nCodes now used:")
print(
    doctor_codes.to_string(index=False)
)

print("\nValidation results:")
print("1. MOVER assignment contains 350 rows")
print("2. MOVER assignment contains 14 doctors")
print("3. Every doctor has 25 cases")
print("4. Every doctor has one annotation code")
print("5. Every doctor has one review code")
print("6. Annotation and review codes do not overlap")
print("7. MOVER and MPOG codes do not overlap")
print("8. Both MOVER lookup files exactly match the assignment")
print("9. No extra code-mapping file was generated")
print("\nCompleted.")