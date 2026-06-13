from pathlib import Path
import shutil
import pandas as pd


BASE_DIR = Path(
    "/home/wjyren/GUI_Stanford_mpog/public/assigned_code"
)

MOVER_FILES = [
    BASE_DIR / "assigned_mover_350_cases_by_access_code.csv",
    BASE_DIR / "mover_access_code_lookup_for_ui.csv",
    BASE_DIR / "mover_access_review_code.csv",
]

# MOVER 原始 doctor_01–doctor_14
# 改为全局唯一的 doctor_27–doctor_40
DOCTOR_ID_MAP = {
    f"doctor_{old_id:02d}": f"doctor_{old_id + 26:02d}"
    for old_id in range(1, 15)
}

VALID_NEW_IDS = set(DOCTOR_ID_MAP.values())


def update_one_file(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"文件不存在：{path}")

    df = pd.read_csv(path, dtype=str)

    if "doctor_id" not in df.columns:
        raise ValueError(
            f"{path.name} 中没有 doctor_id 列。"
            f"实际列名：{list(df.columns)}"
        )

    original = df.copy(deep=True)

    current_ids = set(df["doctor_id"].dropna().str.strip())

    unexpected_ids = current_ids - set(DOCTOR_ID_MAP) - VALID_NEW_IDS
    if unexpected_ids:
        raise ValueError(
            f"{path.name} 中发现无法识别的 doctor_id："
            f"{sorted(unexpected_ids)}"
        )

    # 支持重复运行：
    # doctor_01–doctor_14 会转换；
    # 已经是 doctor_27–doctor_40 的保持不变。
    df["doctor_id"] = (
        df["doctor_id"]
        .str.strip()
        .replace(DOCTOR_ID_MAP)
    )

    backup_path = path.with_suffix(path.suffix + ".before_doctor_id_update.bak")
    if not backup_path.exists():
        shutil.copy2(path, backup_path)

    # 确认除了 doctor_id，其他列完全没变
    other_columns = [
        column for column in df.columns
        if column != "doctor_id"
    ]

    if not original[other_columns].equals(df[other_columns]):
        raise AssertionError(
            f"{path.name} 中除 doctor_id 外还有其他字段发生变化。"
        )

    df.to_csv(path, index=False)

    print(f"\n已更新：{path.name}")
    print(
        df["doctor_id"]
        .value_counts()
        .sort_index()
        .to_string()
    )

    return df


def validate_files(
    assignment: pd.DataFrame,
    lookup: pd.DataFrame,
    review: pd.DataFrame,
) -> None:
    expected_doctors = {
        f"doctor_{doctor_id:02d}"
        for doctor_id in range(27, 41)
    }

    # 1. 三个文件都必须是 doctor_27–doctor_40
    for name, df in [
        ("assignment", assignment),
        ("lookup", lookup),
        ("review", review),
    ]:
        actual = set(df["doctor_id"].dropna())

        if actual != expected_doctors:
            raise AssertionError(
                f"{name} doctor_id 不正确。\n"
                f"缺失：{sorted(expected_doctors - actual)}\n"
                f"多余：{sorted(actual - expected_doctors)}"
            )

    # 2. Assignment：350 行、每位医生 25 例
    if len(assignment) != 350:
        raise AssertionError(
            f"Assignment 应为 350 行，实际为 {len(assignment)} 行。"
        )

    assignment_counts = assignment.groupby("doctor_id").size()

    if not assignment_counts.eq(25).all():
        raise AssertionError(
            "Assignment 中不是每位医生都有 25 个病例：\n"
            f"{assignment_counts.to_string()}"
        )

    # 3. 每位医生仅有一个 annotation code 和一个 review code
    code_counts = assignment.groupby("doctor_id").agg(
        n_annotation_codes=("annotation_code", "nunique"),
        n_review_codes=("review_code", "nunique"),
    )

    if not (
        code_counts["n_annotation_codes"].eq(1).all()
        and code_counts["n_review_codes"].eq(1).all()
    ):
        raise AssertionError(
            "Assignment 中部分医生具有多个 code：\n"
            f"{code_counts.to_string()}"
        )

    # 4. 从 assignment 提取标准 doctor-code 对应关系
    expected_codes = (
        assignment[
            ["doctor_id", "annotation_code", "review_code"]
        ]
        .drop_duplicates()
        .sort_values("doctor_id")
        .reset_index(drop=True)
    )

    # 5. 验证 mover_access_review_code.csv
    actual_review = (
        review[
            ["doctor_id", "annotation_code", "review_code"]
        ]
        .drop_duplicates()
        .sort_values("doctor_id")
        .reset_index(drop=True)
    )

    if not expected_codes.equals(actual_review):
        comparison = expected_codes.merge(
            actual_review,
            on="doctor_id",
            how="outer",
            suffixes=("_assignment", "_review"),
            indicator=True,
        )

        raise AssertionError(
            "mover_access_review_code.csv 与 assignment 的 code 对应不一致：\n"
            f"{comparison.to_string(index=False)}"
        )

    # 6. 验证 mover_access_code_lookup_for_ui.csv
    required_lookup_columns = {
        "access_code",
        "doctor_id",
        "workflowMode",
    }

    missing_lookup_columns = (
        required_lookup_columns - set(lookup.columns)
    )

    if missing_lookup_columns:
        raise AssertionError(
            "mover_access_code_lookup_for_ui.csv 缺少列："
            f"{sorted(missing_lookup_columns)}"
        )

    expected_lookup_rows = []

    for row in expected_codes.itertuples(index=False):
        expected_lookup_rows.append(
            {
                "access_code": row.annotation_code,
                "doctor_id": row.doctor_id,
                "workflowMode": "annotation",
            }
        )
        expected_lookup_rows.append(
            {
                "access_code": row.review_code,
                "doctor_id": row.doctor_id,
                "workflowMode": "review",
            }
        )

    expected_lookup = (
        pd.DataFrame(expected_lookup_rows)
        .sort_values(
            ["doctor_id", "workflowMode", "access_code"]
        )
        .reset_index(drop=True)
    )

    actual_lookup = (
        lookup[
            ["access_code", "doctor_id", "workflowMode"]
        ]
        .copy()
        .sort_values(
            ["doctor_id", "workflowMode", "access_code"]
        )
        .reset_index(drop=True)
    )

    if not expected_lookup.equals(actual_lookup):
        raise AssertionError(
            "mover_access_code_lookup_for_ui.csv "
            "与 assignment 的 code 对应不一致。"
        )

    # 7. annotation code 和 review code 不能交叉
    annotation_codes = set(expected_codes["annotation_code"])
    review_codes = set(expected_codes["review_code"])

    overlap = annotation_codes & review_codes

    if overlap:
        raise AssertionError(
            f"annotation_code 和 review_code 存在交叉：{sorted(overlap)}"
        )

    print("\n" + "=" * 70)
    print("ALL MOVER DOCTOR-ID VALIDATIONS PASSED")
    print("=" * 70)
    print("1. MOVER doctor_01–doctor_14 已统一改为 doctor_27–doctor_40")
    print("2. Assignment 仍为 350 行")
    print("3. 每位 MOVER doctor 仍为 25 个病例")
    print("4. Annotation code 未改变")
    print("5. Review code 未改变")
    print("6. 除 doctor_id 外，其他字段未改变")
    print("7. 三个 MOVER 文件的 doctor/code 对应完全一致")
    print("8. Annotation code 与 review code 无交叉")
    print("\n最终对应关系：")
    print(expected_codes.to_string(index=False))


def main() -> None:
    assignment = update_one_file(MOVER_FILES[0])
    lookup = update_one_file(MOVER_FILES[1])
    review = update_one_file(MOVER_FILES[2])

    validate_files(
        assignment=assignment,
        lookup=lookup,
        review=review,
    )


if __name__ == "__main__":
    main()