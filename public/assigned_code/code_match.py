#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

MPOG_LOOKUP = "access_code_lookup_for_ui.csv"
MPOG_CASES = "assigned_650_cases_by_access_code.csv"
MOVER_LOOKUP = "mover_access_code_lookup_for_ui.csv"
MOVER_CASES = "assigned_mover_350_cases_by_access_code.csv"

# doctor_id: (old_annotation_code, new_annotation_code)
MPOG_CHANGES = {
    "doctor_08": ("5785", "7592"),
    "doctor_10": ("8741", "9470"),
    "doctor_11": ("8372", "6364"),
    "doctor_13": ("3655", "7711"),
    "doctor_14": ("9424", "2828"),
}

MOVER_CHANGES = {
    "doctor_27": ("2828", "9424"),
    "doctor_29": ("7592", "5785"),
    "doctor_31": ("9470", "8741"),
    "doctor_32": ("6364", "8372"),
    "doctor_34": ("7711", "3655"),
}


def load_csv(path: Path) -> pd.DataFrame:
    if not path.is_file():
        raise FileNotFoundError(f"Missing file: {path}")
    return pd.read_csv(path, dtype=str, keep_default_na=False)


def require_columns(df: pd.DataFrame, path: Path, columns: set[str]) -> None:
    missing = sorted(columns - set(df.columns))
    if missing:
        raise ValueError(f"{path.name} missing columns: {missing}")


def change_lookup(df: pd.DataFrame, path: Path, changes: dict[str, tuple[str, str]]) -> pd.DataFrame:
    require_columns(df, path, {"access_code", "doctor_id", "workflowMode", "n_assigned"})
    old_df = df.copy(deep=True)
    new_df = df.copy(deep=True)

    for doctor_id, (old_code, new_code) in changes.items():
        mask = (new_df["doctor_id"] == doctor_id) & (new_df["workflowMode"].str.lower() == "annotation")
        if int(mask.sum()) != 1:
            raise ValueError(f"{path.name}: expected 1 annotation row for {doctor_id}, found {int(mask.sum())}")
        current = new_df.loc[mask, "access_code"].iloc[0]
        if current != old_code:
            raise ValueError(f"{path.name}: {doctor_id} has {current}, expected {old_code}")
        new_df.loc[mask, "access_code"] = new_code
        print(f"{path.name}: {doctor_id} {old_code} -> {new_code}")

    unchanged = [c for c in old_df.columns if c != "access_code"]
    if not old_df[unchanged].equals(new_df[unchanged]):
        raise AssertionError(f"{path.name}: a non-access_code field changed")

    review_mask = old_df["workflowMode"].str.lower() == "review"
    if not old_df.loc[review_mask].equals(new_df.loc[review_mask]):
        raise AssertionError(f"{path.name}: review rows changed")

    if new_df["access_code"].duplicated().any():
        duplicates = new_df.loc[new_df["access_code"].duplicated(False), "access_code"].tolist()
        raise ValueError(f"{path.name}: duplicate access codes after change: {duplicates}")

    return new_df


def change_cases(df: pd.DataFrame, path: Path, changes: dict[str, tuple[str, str]]) -> pd.DataFrame:
    require_columns(df, path, {"doctor_id", "annotation_code", "review_code"})
    old_df = df.copy(deep=True)
    new_df = df.copy(deep=True)

    for doctor_id, (old_code, new_code) in changes.items():
        mask = new_df["doctor_id"] == doctor_id
        count = int(mask.sum())
        if count != 25:
            raise ValueError(f"{path.name}: expected 25 rows for {doctor_id}, found {count}")
        current_codes = sorted(new_df.loc[mask, "annotation_code"].unique().tolist())
        if current_codes != [old_code]:
            raise ValueError(f"{path.name}: {doctor_id} has annotation codes {current_codes}, expected [{old_code}]")
        new_df.loc[mask, "annotation_code"] = new_code
        print(f"{path.name}: {doctor_id}, 25 rows, {old_code} -> {new_code}")

    unchanged = [c for c in old_df.columns if c != "annotation_code"]
    if not old_df[unchanged].equals(new_df[unchanged]):
        raise AssertionError(f"{path.name}: a patient, case, review, doctor, or other field changed")

    changed = int((old_df["annotation_code"] != new_df["annotation_code"]).sum())
    expected = 25 * len(changes)
    if changed != expected:
        raise AssertionError(f"{path.name}: expected {expected} changed cells, found {changed}")

    return new_df


def atomic_write(df: pd.DataFrame, path: Path) -> None:
    temp = path.with_name(path.name + ".exchange_tmp")
    try:
        df.to_csv(temp, index=False, lineterminator="\n")
        temp.replace(path)
    finally:
        if temp.exists():
            temp.unlink()


def main() -> int:
    parser = argparse.ArgumentParser(description="Exchange selected MPOG and MOVER annotation codes safely.")
    parser.add_argument("--base-dir", type=Path, default=Path("public/assigned_code"))
    parser.add_argument("--apply", action="store_true", help="Write changes; without this flag, perform dry run only")
    args = parser.parse_args()

    base = args.base_dir.resolve()
    paths = {
        MPOG_LOOKUP: base / MPOG_LOOKUP,
        MPOG_CASES: base / MPOG_CASES,
        MOVER_LOOKUP: base / MOVER_LOOKUP,
        MOVER_CASES: base / MOVER_CASES,
    }

    try:
        originals = {name: load_csv(path) for name, path in paths.items()}
        updated = {
            MPOG_LOOKUP: change_lookup(originals[MPOG_LOOKUP], paths[MPOG_LOOKUP], MPOG_CHANGES),
            MPOG_CASES: change_cases(originals[MPOG_CASES], paths[MPOG_CASES], MPOG_CHANGES),
            MOVER_LOOKUP: change_lookup(originals[MOVER_LOOKUP], paths[MOVER_LOOKUP], MOVER_CHANGES),
            MOVER_CASES: change_cases(originals[MOVER_CASES], paths[MOVER_CASES], MOVER_CHANGES),
        }

        if not args.apply:
            print("\nDRY RUN PASSED. No files were changed.")
            print("Run again with --apply to write the changes.")
            return 0

        backup = base / f"backup_before_annotation_exchange_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        backup.mkdir(parents=False, exist_ok=False)
        for name, path in paths.items():
            shutil.copy2(path, backup / name)

        for name, path in paths.items():
            atomic_write(updated[name], path)

        for name, path in paths.items():
            written = load_csv(path)
            if not written.equals(updated[name]):
                raise AssertionError(f"Post-write verification failed for {name}; restore from {backup}")

        print("\nSUCCESS: four CSV files updated.")
        print(f"Backup: {backup}")
        print("Review codes and all patient/case fields were unchanged.")
        return 0

    except Exception as exc:
        print(f"\nERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
