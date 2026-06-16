import argparse
import io
import json
import os
import re
import tempfile
import warnings
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

warnings.filterwarnings(
    "ignore",
    message=r"You are using a Python version.*",
    category=FutureWarning,
)

import gspread
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload


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

OUTPUT_ROOT = Path(
    "/home/wjyren/Surgical/annotated_data"
)

MANIFEST_PATH = (
    OUTPUT_ROOT / ".drive_result_sync_manifest.json"
)

FOLDER_MIME_TYPE = "application/vnd.google-apps.folder"
GOOGLE_NATIVE_MIME_PREFIX = "application/vnd.google-apps."

SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/spreadsheets.readonly",
]


# ============================================================
# Data structures
# ============================================================

@dataclass(frozen=True)
class CodePair:
    dataset: str
    annotation_code: str
    review_code: str
    sheet_row: int


@dataclass
class SyncStats:
    mapping_rows: int = 0

    annotation_cases: int = 0
    review_cases: int = 0

    primary_review_cases: int = 0
    fallback_review_cases: int = 0

    files_downloaded: int = 0
    files_unchanged: int = 0
    files_failed: int = 0
    files_skipped_google_native: int = 0

    incomplete_cases_skipped: int = 0
    missing_annotation_roots: int = 0


# ============================================================
# General helpers
# ============================================================

def safe_name(
    value: Any,
    fallback: str = "unnamed",
) -> str:
    text = str(value or "").strip()

    if not text:
        return fallback

    text = re.sub(
        r'[<>:"/\\|?*\x00-\x1f]+',
        "_",
        text,
    )

    text = text.strip(" .")

    return text or fallback


def parse_modified_time(
    value: Any,
) -> float | None:
    text = str(value or "").strip()

    if not text:
        return None

    try:
        return datetime.fromisoformat(
            text.replace("Z", "+00:00")
        ).timestamp()
    except ValueError:
        return None


def load_manifest() -> dict[str, dict[str, Any]]:
    if not MANIFEST_PATH.exists():
        return {}

    try:
        with MANIFEST_PATH.open(
            "r",
            encoding="utf-8",
        ) as file:
            data = json.load(file)

        if isinstance(data, dict):
            return {
                str(key): value
                for key, value in data.items()
                if isinstance(value, dict)
            }

    except Exception as error:
        print(
            f"WARNING: failed to read manifest: {error}"
        )

    return {}


def save_manifest(
    manifest: dict[str, dict[str, Any]],
) -> None:
    OUTPUT_ROOT.mkdir(
        parents=True,
        exist_ok=True,
    )

    temporary_path = MANIFEST_PATH.with_suffix(
        ".json.tmp"
    )

    with temporary_path.open(
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            manifest,
            file,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )

    os.replace(
        temporary_path,
        MANIFEST_PATH,
    )


# ============================================================
# Google Sheet mapping
# ============================================================

def load_code_pairs(
    credentials: Any,
) -> list[CodePair]:
    sheet_client = gspread.authorize(
        credentials
    )

    worksheet = (
        sheet_client
        .open_by_key(SPREADSHEET_ID)
        .worksheet(WORKSHEET_NAME)
    )

    rows = worksheet.get_all_values()

    current_dataset: str | None = None
    pairs: list[CodePair] = []

    for row_number, row in enumerate(
        rows,
        start=1,
    ):
        cells = [
            str(value or "").strip()
            for value in row
        ]

        upper_cells = [
            value.upper()
            for value in cells
        ]

        # Switch dataset only when the cell is exactly MPOG or MOVER.
        if "MPOG" in upper_cells:
            current_dataset = "stanford_mpog"

        if "MOVER" in upper_cells:
            current_dataset = "mover"

        annotation_code = (
            cells[2]
            if len(cells) > 2
            else ""
        )

        review_code = (
            cells[3]
            if len(cells) > 3
            else ""
        )

        if current_dataset is None:
            continue

        if not re.fullmatch(
            r"\d{4}",
            annotation_code,
        ):
            continue

        if not re.fullmatch(
            r"\d{4}",
            review_code,
        ):
            review_code = ""

        pairs.append(
            CodePair(
                dataset=current_dataset,
                annotation_code=annotation_code,
                review_code=review_code,
                sheet_row=row_number,
            )
        )

    return pairs


# ============================================================
# Google Drive index
# ============================================================

class DriveIndex:
    def __init__(
        self,
        drive_service: Any,
    ) -> None:
        self.drive_service = drive_service

        self.items = self._load_all_items()

        self.children_map: dict[
            str,
            list[dict[str, Any]]
        ] = defaultdict(list)

        for item in self.items:
            for parent_id in item.get(
                "parents",
                [],
            ):
                self.children_map[parent_id].append(
                    item
                )

        for children in self.children_map.values():
            children.sort(
                key=lambda item: str(
                    item.get("name", "")
                )
            )

        self.root_code_folders = (
            self._build_root_code_folder_map()
        )

    def _load_all_items(
        self,
    ) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        page_token: str | None = None

        while True:
            response = (
                self.drive_service.files()
                .list(
                    q="trashed = false",
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
                        "parents,"
                        "modifiedTime,"
                        "size"
                        ")"
                    ),
                )
                .execute()
            )

            items.extend(
                response.get("files", [])
            )

            page_token = response.get(
                "nextPageToken"
            )

            if not page_token:
                break

        return items

    def _build_root_code_folder_map(
        self,
    ) -> dict[str, dict[str, Any]]:
        result: dict[str, dict[str, Any]] = {}

        for item in self.children_map.get(
            SHARED_DRIVE_ID,
            [],
        ):
            name = str(
                item.get("name", "")
            ).strip()

            if (
                item.get("mimeType")
                == FOLDER_MIME_TYPE
                and re.fullmatch(r"\d{4}", name)
            ):
                result[name] = item

        return result

    def children(
        self,
        parent_id: str,
    ) -> list[dict[str, Any]]:
        return self.children_map.get(
            parent_id,
            [],
        )

    def find_child_folder(
        self,
        parent_id: str,
        folder_name: str,
    ) -> dict[str, Any] | None:
        matches = [
            item
            for item in self.children(parent_id)
            if (
                item.get("mimeType")
                == FOLDER_MIME_TYPE
                and str(
                    item.get("name", "")
                ).strip()
                == folder_name
            )
        ]

        if not matches:
            return None

        if len(matches) > 1:
            print(
                f"WARNING: found {len(matches)} folders "
                f"named {folder_name!r} under {parent_id}; "
                "using the first one."
            )

        return matches[0]

    def get_workflow_case_folders(
        self,
        code: str,
        workflow: str,
    ) -> list[dict[str, Any]]:
        code_folder = self.root_code_folders.get(
            code
        )

        if code_folder is None:
            return []

        workflow_folder = self.find_child_folder(
            code_folder["id"],
            workflow,
        )

        if workflow_folder is None:
            return []

        return [
            item
            for item in self.children(
                workflow_folder["id"]
            )
            if (
                item.get("mimeType")
                == FOLDER_MIME_TYPE
                and str(
                    item.get("name", "")
                ).startswith("patient_")
            )
        ]

    def case_is_completed(
        self,
        case_folder: dict[str, Any],
    ) -> bool:
        submission_folder = self.find_child_folder(
            case_folder["id"],
            "case_submission",
        )

        if submission_folder is None:
            return False

        for item in self.children(
            submission_folder["id"]
        ):
            if (
                item.get("mimeType")
                == FOLDER_MIME_TYPE
            ):
                continue

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

            if size_text:
                try:
                    if int(size_text) <= 0:
                        continue
                except ValueError:
                    pass

            return True

        return False

    def descendant_files(
        self,
        case_folder_id: str,
    ) -> list[
        tuple[dict[str, Any], list[str]]
    ]:
        results: list[
            tuple[dict[str, Any], list[str]]
        ] = []

        stack: list[
            tuple[str, list[str]]
        ] = [
            (case_folder_id, [])
        ]

        while stack:
            parent_id, relative_parts = (
                stack.pop()
            )

            for item in self.children(parent_id):
                item_name = safe_name(
                    item.get("name"),
                    fallback=item["id"],
                )

                if (
                    item.get("mimeType")
                    == FOLDER_MIME_TYPE
                ):
                    stack.append(
                        (
                            item["id"],
                            relative_parts
                            + [item_name],
                        )
                    )

                    continue

                results.append(
                    (
                        item,
                        relative_parts,
                    )
                )

        results.sort(
            key=lambda pair: (
                "/".join(pair[1]),
                str(pair[0].get("name", "")),
            )
        )

        return results


# ============================================================
# Case selection and mapping
# ============================================================

def filter_cases(
    drive_index: DriveIndex,
    cases: list[dict[str, Any]],
    include_in_progress: bool,
    stats: SyncStats,
) -> list[dict[str, Any]]:
    if include_in_progress:
        return cases

    completed_cases: list[
        dict[str, Any]
    ] = []

    for case_folder in cases:
        if drive_index.case_is_completed(
            case_folder
        ):
            completed_cases.append(
                case_folder
            )
        else:
            stats.incomplete_cases_skipped += 1

    return completed_cases


def deduplicate_cases_by_name(
    cases: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    When the same case is found in multiple fallback locations,
    keep the most recently modified case folder.
    """
    selected: dict[
        str,
        dict[str, Any]
    ] = {}

    for case_folder in cases:
        case_name = str(
            case_folder.get("name", "")
        ).strip()

        previous = selected.get(
            case_name
        )

        if previous is None:
            selected[case_name] = case_folder
            continue

        previous_modified = str(
            previous.get("modifiedTime", "")
        )

        current_modified = str(
            case_folder.get("modifiedTime", "")
        )

        if current_modified > previous_modified:
            selected[case_name] = case_folder

    return sorted(
        selected.values(),
        key=lambda item: str(
            item.get("name", "")
        ),
    )


def get_annotation_cases(
    drive_index: DriveIndex,
    pair: CodePair,
    include_in_progress: bool,
    stats: SyncStats,
) -> list[dict[str, Any]]:
    raw_cases = (
        drive_index.get_workflow_case_folders(
            pair.annotation_code,
            "annotation",
        )
    )

    return filter_cases(
        drive_index,
        raw_cases,
        include_in_progress,
        stats,
    )


def get_review_cases(
    drive_index: DriveIndex,
    pair: CodePair,
    include_in_progress: bool,
    stats: SyncStats,
) -> tuple[
    list[dict[str, Any]],
    str,
]:
    """
    Review source priority:

    1. annotation_code/review
    2. When no usable primary review cases exist:
       review_code/annotation
       review_code/review

    The local folder always uses annotation_code_review.
    """
    primary_raw = (
        drive_index.get_workflow_case_folders(
            pair.annotation_code,
            "review",
        )
    )

    primary_cases = filter_cases(
        drive_index,
        primary_raw,
        include_in_progress,
        stats,
    )

    if primary_cases:
        stats.primary_review_cases += len(
            primary_cases
        )

        return (
            deduplicate_cases_by_name(
                primary_cases
            ),
            (
                f"{pair.annotation_code}/review"
            ),
        )

    if not pair.review_code:
        return [], "no review code"

    fallback_annotation_raw = (
        drive_index.get_workflow_case_folders(
            pair.review_code,
            "annotation",
        )
    )

    fallback_review_raw = (
        drive_index.get_workflow_case_folders(
            pair.review_code,
            "review",
        )
    )

    fallback_cases = filter_cases(
        drive_index,
        (
            fallback_annotation_raw
            + fallback_review_raw
        ),
        include_in_progress,
        stats,
    )

    fallback_cases = deduplicate_cases_by_name(
        fallback_cases
    )

    stats.fallback_review_cases += len(
        fallback_cases
    )

    return (
        fallback_cases,
        (
            f"{pair.review_code}/annotation "
            f"or {pair.review_code}/review"
        ),
    )


# ============================================================
# Download logic
# ============================================================

def should_download(
    file_item: dict[str, Any],
    local_path: Path,
    manifest: dict[str, dict[str, Any]],
    force: bool,
) -> bool:
    if force:
        return True

    if not local_path.exists():
        return True

    file_id = str(
        file_item.get("id", "")
    )

    previous = manifest.get(
        file_id,
        {},
    )

    return not (
        previous.get("modifiedTime")
        == file_item.get("modifiedTime")
        and str(previous.get("size", ""))
        == str(file_item.get("size", ""))
        and previous.get("localPath")
        == str(local_path.resolve())
    )


def download_file_bytes(
    drive_service: Any,
    file_id: str,
) -> bytes:
    request = (
        drive_service.files()
        .get_media(
            fileId=file_id,
            supportsAllDrives=True,
        )
    )

    buffer = io.BytesIO()

    downloader = MediaIoBaseDownload(
        buffer,
        request,
    )

    done = False

    while not done:
        _, done = downloader.next_chunk()

    return buffer.getvalue()


def write_file_atomically(
    local_path: Path,
    content: bytes,
) -> None:
    local_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    file_descriptor, temporary_name = (
        tempfile.mkstemp(
            prefix=f".{local_path.name}.",
            suffix=".tmp",
            dir=str(local_path.parent),
        )
    )

    temporary_path = Path(
        temporary_name
    )

    try:
        with os.fdopen(
            file_descriptor,
            "wb",
        ) as output_file:
            output_file.write(content)

        os.replace(
            temporary_path,
            local_path,
        )

    finally:
        if temporary_path.exists():
            temporary_path.unlink()


def set_local_modified_time(
    local_path: Path,
    modified_time: Any,
) -> None:
    timestamp = parse_modified_time(
        modified_time
    )

    if timestamp is None:
        return

    try:
        os.utime(
            local_path,
            (
                timestamp,
                timestamp,
            ),
        )
    except OSError:
        pass


def sync_case(
    drive_service: Any,
    drive_index: DriveIndex,
    case_folder: dict[str, Any],
    local_group_folder: Path,
    manifest: dict[str, dict[str, Any]],
    stats: SyncStats,
    dry_run: bool,
    force: bool,
) -> None:
    case_name = safe_name(
        case_folder.get("name"),
        fallback=case_folder["id"],
    )

    local_case_folder = (
        local_group_folder
        / case_name
    )

    remote_files = (
        drive_index.descendant_files(
            case_folder["id"]
        )
    )

    print(
        f"    {case_name}: "
        f"{len(remote_files)} file(s)"
    )

    for file_item, relative_parts in remote_files:
        mime_type = str(
            file_item.get("mimeType", "")
        )

        remote_name = safe_name(
            file_item.get("name"),
            fallback=file_item["id"],
        )

        local_path = (
            local_case_folder
            .joinpath(*relative_parts)
            / remote_name
        )

        if (
            mime_type.startswith(
                GOOGLE_NATIVE_MIME_PREFIX
            )
            and mime_type != FOLDER_MIME_TYPE
        ):
            stats.files_skipped_google_native += 1

            print(
                f"      [SKIP GOOGLE FILE] "
                f"{remote_name}"
            )

            continue

        if not should_download(
            file_item,
            local_path,
            manifest,
            force,
        ):
            stats.files_unchanged += 1
            continue

        if dry_run:
            print(
                f"      [WOULD DOWNLOAD] "
                f"{local_path}"
            )

            continue

        try:
            content = download_file_bytes(
                drive_service,
                file_item["id"],
            )

            write_file_atomically(
                local_path,
                content,
            )

            set_local_modified_time(
                local_path,
                file_item.get("modifiedTime"),
            )

            manifest[
                str(file_item["id"])
            ] = {
                "name": file_item.get("name"),
                "modifiedTime": file_item.get(
                    "modifiedTime"
                ),
                "size": file_item.get("size"),
                "localPath": str(
                    local_path.resolve()
                ),
            }

            stats.files_downloaded += 1

            print(
                f"      [DOWNLOADED] "
                f"{local_path}"
            )

        except Exception as error:
            stats.files_failed += 1

            print(
                f"      [ERROR] "
                f"{remote_name}: {error}"
            )


def sync_case_group(
    drive_service: Any,
    drive_index: DriveIndex,
    cases: list[dict[str, Any]],
    dataset: str,
    annotation_code: str,
    local_workflow: str,
    manifest: dict[str, dict[str, Any]],
    stats: SyncStats,
    dry_run: bool,
    force: bool,
) -> None:
    if not cases:
        return

    local_group_folder = (
        OUTPUT_ROOT
        / dataset
        / f"{annotation_code}_{local_workflow}"
    )

    print(
        f"  LOCAL GROUP: {local_group_folder}"
    )

    for case_folder in cases:
        sync_case(
            drive_service=drive_service,
            drive_index=drive_index,
            case_folder=case_folder,
            local_group_folder=local_group_folder,
            manifest=manifest,
            stats=stats,
            dry_run=dry_run,
            force=force,
        )


# ============================================================
# Main
# ============================================================

def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Incrementally synchronize completed annotation and review "
            "results from Google Shared Drive to the local server."
        )
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help=(
            "Preview synchronization without writing local files."
        ),
    )

    parser.add_argument(
        "--force",
        action="store_true",
        help=(
            "Download all files again, including unchanged files."
        ),
    )

    parser.add_argument(
        "--include-in-progress",
        action="store_true",
        help=(
            "Also synchronize cases without a final case_submission JSON. "
            "By default, only formally submitted cases are synchronized."
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

    print(
        "Loading annotation/review mapping from Google Sheet..."
    )

    code_pairs = load_code_pairs(
        credentials
    )

    print(
        f"Found {len(code_pairs)} annotation/review mapping row(s)."
    )

    print(
        "Reading Google Shared Drive structure..."
    )

    drive_index = DriveIndex(
        drive_service
    )

    print(
        f"Found {len(drive_index.root_code_folders)} "
        "four-digit root code folder(s)."
    )

    manifest = load_manifest()
    updated_manifest = dict(manifest)

    stats = SyncStats(
        mapping_rows=len(code_pairs)
    )

    for pair in code_pairs:
        print()
        print(
            f"[{pair.dataset}] "
            f"annotation={pair.annotation_code}, "
            f"review={pair.review_code or '-'}, "
            f"sheet row={pair.sheet_row}"
        )

        if (
            pair.annotation_code
            not in drive_index.root_code_folders
        ):
            stats.missing_annotation_roots += 1

        annotation_cases = get_annotation_cases(
            drive_index=drive_index,
            pair=pair,
            include_in_progress=args.include_in_progress,
            stats=stats,
        )

        review_cases, review_source = get_review_cases(
            drive_index=drive_index,
            pair=pair,
            include_in_progress=args.include_in_progress,
            stats=stats,
        )

        stats.annotation_cases += len(
            annotation_cases
        )

        stats.review_cases += len(
            review_cases
        )

        print(
            f"  Annotation cases selected: "
            f"{len(annotation_cases)}"
        )

        print(
            f"  Review cases selected: "
            f"{len(review_cases)}"
        )

        if review_cases:
            print(
                f"  Review Drive source: "
                f"{review_source}"
            )

        sync_case_group(
            drive_service=drive_service,
            drive_index=drive_index,
            cases=annotation_cases,
            dataset=pair.dataset,
            annotation_code=pair.annotation_code,
            local_workflow="annotation",
            manifest=updated_manifest,
            stats=stats,
            dry_run=args.dry_run,
            force=args.force,
        )

        sync_case_group(
            drive_service=drive_service,
            drive_index=drive_index,
            cases=review_cases,
            dataset=pair.dataset,
            annotation_code=pair.annotation_code,
            local_workflow="review",
            manifest=updated_manifest,
            stats=stats,
            dry_run=args.dry_run,
            force=args.force,
        )

    if not args.dry_run:
        save_manifest(
            updated_manifest
        )

    print()
    print("========== SYNC SUMMARY ==========")

    print(
        f"Mapping rows: {stats.mapping_rows}"
    )

    print(
        f"Completed annotation cases selected: "
        f"{stats.annotation_cases}"
    )

    print(
        f"Completed review cases selected: "
        f"{stats.review_cases}"
    )

    print(
        f"Review cases from annotation-code/review: "
        f"{stats.primary_review_cases}"
    )

    print(
        f"Review cases from review-code fallback: "
        f"{stats.fallback_review_cases}"
    )

    print(
        f"In-progress cases skipped: "
        f"{stats.incomplete_cases_skipped}"
    )

    print(
        f"Files downloaded or updated: "
        f"{stats.files_downloaded}"
    )

    print(
        f"Files already unchanged: "
        f"{stats.files_unchanged}"
    )

    print(
        f"Files failed: {stats.files_failed}"
    )

    print(
        f"Google-native files skipped: "
        f"{stats.files_skipped_google_native}"
    )

    if args.dry_run:
        print()
        print(
            "DRY RUN ONLY: no local files were written."
        )
    else:
        print()
        print(
            "SYNC COMPLETE."
        )

        print(
            "Stanford MPOG output:"
        )

        print(
            OUTPUT_ROOT / "stanford_mpog"
        )

        print(
            "MOVER output:"
        )

        print(
            OUTPUT_ROOT / "mover"
        )

        print(
            "Local files were not deleted."
        )


if __name__ == "__main__":
    main()

# python scripts/sync_data.py