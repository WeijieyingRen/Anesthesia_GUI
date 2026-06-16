import argparse
import re
import warnings
from pathlib import Path
from typing import Any

# 必须放在 Google API imports 之前，才能隐藏 Python 3.10 FutureWarning。
warnings.filterwarnings(
    "ignore",
    message=r"You are using a Python version.*",
    category=FutureWarning,
)

import gspread
from google.oauth2 import service_account
from googleapiclient.discovery import build


# ============================================================
# Configuration
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[1]

SERVICE_ACCOUNT_FILE = (
    PROJECT_ROOT / "anesthesialens-64c3c8b9f05e.json"
)

SPREADSHEET_ID = (
    "1KoWXcULJLnfnw4b9RQ8CFOQNcNb_VQ1uHKhpXjOLmDU"
)

WORKSHEET_NAME = "New"

SHARED_DRIVE_ID = "0AE3zDGMQaw-IUk9PVA"

FOLDER_MIME_TYPE = "application/vnd.google-apps.folder"

SCOPES = [
    # Drive remains read-only.
    "https://www.googleapis.com/auth/drive.readonly",

    # Google Sheet requires write permission when --write is used.
    "https://www.googleapis.com/auth/spreadsheets",
]


# ============================================================
# Google Drive helpers
# ============================================================

def list_children(
    drive_service: Any,
    parent_id: str,
) -> list[dict[str, Any]]:
    """
    Return every non-trashed item directly under a Google Drive folder.

    Pagination is handled automatically.
    """
    files: list[dict[str, Any]] = []
    page_token: str | None = None

    while True:
        response = (
            drive_service.files()
            .list(
                q=f"'{parent_id}' in parents and trashed = false",
                corpora="drive",
                driveId=SHARED_DRIVE_ID,
                includeItemsFromAllDrives=True,
                supportsAllDrives=True,
                pageSize=1000,
                pageToken=page_token,
                fields=(
                    "nextPageToken,"
                    "files("
                    "id,"
                    "name,"
                    "mimeType,"
                    "size,"
                    "modifiedTime,"
                    "parents"
                    ")"
                ),
            )
            .execute()
        )

        files.extend(response.get("files", []))
        page_token = response.get("nextPageToken")

        if not page_token:
            break

    return files


def find_child_folder(
    drive_service: Any,
    parent_id: str,
    folder_name: str,
) -> dict[str, Any] | None:
    """
    Find a direct child folder with the requested name.
    """
    matches = [
        item
        for item in list_children(drive_service, parent_id)
        if item.get("mimeType") == FOLDER_MIME_TYPE
        and str(item.get("name", "")).strip() == folder_name
    ]

    if not matches:
        return None

    if len(matches) > 1:
        print(
            f"WARNING: found {len(matches)} folders named "
            f"{folder_name!r} under parent {parent_id}; "
            "using the first one."
        )

    return matches[0]


def contains_submission_json(
    drive_service: Any,
    case_folder_id: str,
) -> bool:
    """
    A case is considered completed only when it contains:

    case folder/
        case_submission/
            at least one non-empty JSON file
    """
    case_children = list_children(
        drive_service,
        case_folder_id,
    )

    submission_folders = [
        item
        for item in case_children
        if item.get("mimeType") == FOLDER_MIME_TYPE
        and str(item.get("name", "")).strip() == "case_submission"
    ]

    for submission_folder in submission_folders:
        submission_files = list_children(
            drive_service,
            submission_folder["id"],
        )

        for item in submission_files:
            name = str(
                item.get("name", "")
            ).strip().lower()

            mime_type = str(
                item.get("mimeType", "")
            ).strip().lower()

            size_text = str(
                item.get("size", "")
            ).strip()

            is_json = (
                name.endswith(".json")
                or mime_type == "application/json"
            )

            if not is_json:
                continue

            # Reject the file only when Google explicitly reports size 0.
            if size_text:
                try:
                    if int(size_text) <= 0:
                        continue
                except ValueError:
                    pass

            return True

    return False


def count_completed_cases(
    drive_service: Any,
    code_folder_id: str,
    workflow_name: str,
) -> int:
    """
    Count formally submitted cases under:

    annotation_code/annotation/
    or
    annotation_code/review/
    """
    workflow_folder = find_child_folder(
        drive_service,
        code_folder_id,
        workflow_name,
    )

    if workflow_folder is None:
        return 0

    workflow_children = list_children(
        drive_service,
        workflow_folder["id"],
    )

    case_folders = [
        item
        for item in workflow_children
        if item.get("mimeType") == FOLDER_MIME_TYPE
        and str(item.get("name", "")).startswith("patient_")
    ]

    completed_count = 0

    for case_folder in case_folders:
        if contains_submission_json(
            drive_service,
            case_folder["id"],
        ):
            completed_count += 1

    return completed_count


# ============================================================
# Google Sheet helpers
# ============================================================

def get_cell_value(
    row: list[str],
    zero_based_column_index: int,
) -> str:
    """
    Safely read a cell from a worksheet row.
    """
    if len(row) <= zero_based_column_index:
        return ""

    return str(row[zero_based_column_index]).strip()


def verify_written_cells(
    worksheet: Any,
    expected_values: dict[str, str],
) -> list[tuple[str, str, str]]:
    """
    Re-read K:L after writing and return any mismatches.

    Each returned tuple contains:
        cell, expected value, actual value
    """
    refreshed_rows = worksheet.get_all_values()
    mismatches: list[tuple[str, str, str]] = []

    for cell, expected_value in expected_values.items():
        match = re.fullmatch(r"([KL])(\d+)", cell)

        if not match:
            mismatches.append(
                (cell, expected_value, "<invalid cell reference>")
            )
            continue

        column_letter = match.group(1)
        row_number = int(match.group(2))

        column_index = {
            "K": 10,
            "L": 11,
        }[column_letter]

        if row_number < 1 or row_number > len(refreshed_rows):
            actual_value = ""
        else:
            actual_value = get_cell_value(
                refreshed_rows[row_number - 1],
                column_index,
            )

        if actual_value != expected_value:
            mismatches.append(
                (
                    cell,
                    expected_value,
                    actual_value,
                )
            )

    return mismatches


# ============================================================
# Main
# ============================================================

def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Count completed annotation and review cases in Google Drive, "
            "then optionally write the counts to columns K and L in "
            "Google Sheets."
        )
    )

    parser.add_argument(
        "--write",
        action="store_true",
        help=(
            "Write annotation counts to column K and review counts "
            "to column L. Without this option, the script only previews."
        ),
    )

    args = parser.parse_args()

    if not SERVICE_ACCOUNT_FILE.exists():
        raise FileNotFoundError(
            "Service account file was not found: "
            f"{SERVICE_ACCOUNT_FILE}"
        )

    credentials = (
        service_account.Credentials.from_service_account_file(
            str(SERVICE_ACCOUNT_FILE),
            scopes=SCOPES,
        )
    )

    drive_service = build(
        "drive",
        "v3",
        credentials=credentials,
        cache_discovery=False,
    )

    sheet_client = gspread.authorize(credentials)

    worksheet = (
        sheet_client
        .open_by_key(SPREADSHEET_ID)
        .worksheet(WORKSHEET_NAME)
    )

    sheet_rows = worksheet.get_all_values()

    drive_root_items = list_children(
        drive_service,
        SHARED_DRIVE_ID,
    )

    # Root folders whose names are exactly four digits.
    code_folders: dict[str, dict[str, Any]] = {}

    for item in drive_root_items:
        name = str(
            item.get("name", "")
        ).strip()

        if (
            item.get("mimeType") == FOLDER_MIME_TYPE
            and re.fullmatch(r"\d{4}", name)
        ):
            code_folders[name] = item

    print(
        "ROW | ANNOTATION CODE | REVIEW CODE | "
        "ANNOTATION COMPLETED | REVIEW COMPLETED | DRIVE STATUS"
    )

    annotation_total = 0
    review_total = 0
    matched_rows = 0

    preview_changes: list[
        tuple[str, str, str, str, str]
    ] = []

    for row_number, row in enumerate(
        sheet_rows,
        start=1,
    ):
        annotation_code = get_cell_value(
            row,
            2,
        )

        review_code = get_cell_value(
            row,
            3,
        )

        # Only C-column values containing exactly four digits
        # are treated as annotation codes.
        if not re.fullmatch(
            r"\d{4}",
            annotation_code,
        ):
            continue

        matched_rows += 1

        current_k = get_cell_value(
            row,
            10,
        )

        current_l = get_cell_value(
            row,
            11,
        )

        code_folder = code_folders.get(
            annotation_code
        )

        if code_folder is None:
            annotation_count = 0
            review_count = 0
            drive_status = "no Drive folder"
        else:
            annotation_count = count_completed_cases(
                drive_service,
                code_folder["id"],
                "annotation",
            )

            review_count = count_completed_cases(
                drive_service,
                code_folder["id"],
                "review",
            )

            drive_status = "found"

        annotation_total += annotation_count
        review_total += review_count

        new_k = str(annotation_count)
        new_l = str(review_count)

        preview_changes.append(
            (
                f"K{row_number}",
                "annotation",
                annotation_code,
                current_k,
                new_k,
            )
        )

        preview_changes.append(
            (
                f"L{row_number}",
                "review",
                review_code,
                current_l,
                new_l,
            )
        )

        print(
            f"{row_number:03d} | "
            f"{annotation_code:>15} | "
            f"{review_code or '-':>11} | "
            f"{annotation_count:>20} | "
            f"{review_count:>16} | "
            f"{drive_status}"
        )

    print()
    print(f"Matched spreadsheet rows: {matched_rows}")
    print(
        "Total completed annotation cases: "
        f"{annotation_total}"
    )
    print(
        "Total completed review cases: "
        f"{review_total}"
    )

    print()
    print("PROPOSED GOOGLE SHEET CHANGES")
    print(
        "CELL | WORKFLOW   | CODE | "
        "CURRENT VALUE -> NEW VALUE | STATUS"
    )

    changed_cells = 0
    unchanged_cells = 0

    for (
        cell,
        workflow,
        code,
        current_value,
        new_value,
    ) in preview_changes:
        display_current = (
            current_value
            if current_value
            else "<blank>"
        )

        status = (
            "CHANGE"
            if current_value != new_value
            else "UNCHANGED"
        )

        if status == "CHANGE":
            changed_cells += 1
        else:
            unchanged_cells += 1

        print(
            f"{cell:>5} | "
            f"{workflow:<10} | "
            f"{code or '-':>4} | "
            f"{display_current!r} -> "
            f"{new_value!r} | "
            f"{status}"
        )

    print()
    print(f"Cells that would change: {changed_cells}")
    print(f"Cells already up to date: {unchanged_cells}")

    changes_to_write = [
        {
            "range": cell,
            "values": [[new_value]],
        }
        for (
            cell,
            _workflow,
            _code,
            current_value,
            new_value,
        ) in preview_changes
        if current_value != new_value
    ]

    expected_written_values = {
        cell: new_value
        for (
            cell,
            _workflow,
            _code,
            current_value,
            new_value,
        ) in preview_changes
        if current_value != new_value
    }

    print()

    if not args.write:
        print(
            "PREVIEW ONLY: Google Sheet was not modified."
        )
        print(
            "Run with --write to update columns K and L."
        )
        return

    if not changes_to_write:
        print(
            "WRITE MODE: No cells required updating. "
            "Google Sheet is already up to date."
        )
        return

    print(
        f"WRITE MODE: Updating {len(changes_to_write)} cells "
        f"in worksheet {WORKSHEET_NAME!r}..."
    )

    worksheet.batch_update(
        changes_to_write,
        value_input_option="RAW",
    )

    print(
        "Write request completed. Verifying updated cells..."
    )

    mismatches = verify_written_cells(
        worksheet,
        expected_written_values,
    )

    if mismatches:
        print()
        print(
            "ERROR: Some cells did not contain the expected value "
            "after writing:"
        )

        for cell, expected, actual in mismatches:
            print(
                f"  {cell}: expected {expected!r}, "
                f"found {actual!r}"
            )

        raise RuntimeError(
            f"Google Sheet verification failed for "
            f"{len(mismatches)} cell(s)."
        )

    print()
    print(
        "WRITE COMPLETE: Google Sheet columns K and L "
        "were updated and verified successfully."
    )

    print(
        f"Updated cells: {len(changes_to_write)}"
    )

    print(
        f"Annotation total written from Drive: {annotation_total}"
    )

    print(
        f"Review total written from Drive: {review_total}"
    )


if __name__ == "__main__":
    main()

# python scripts/sync_annotation_progress.py --write