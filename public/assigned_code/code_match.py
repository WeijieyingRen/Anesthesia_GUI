import csv
from pathlib import Path

# 当前脚本就在 public/assigned_code 目录下运行
base = Path(".")

lookup_path = base / "access_code_lookup_for_ui.csv"
review_path = base / "access_review_code.csv"
assigned_path = base / "assigned_650_cases_by_access_code.csv"

required_files = [lookup_path, review_path, assigned_path]
for p in required_files:
    if not p.exists():
        raise FileNotFoundError(f"Missing file: {p.resolve()}")

# 1. 以 access_code_lookup_for_ui.csv 为唯一基准
#    期待格式：doctor_id, access_code, workflowMode 等
doctor_map = {}

with lookup_path.open(newline="", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)

    for r in reader:
        doctor_id = str(r.get("doctor_id", "")).strip()
        workflow = str(r.get("workflowMode", "")).strip()
        code = str(r.get("access_code", "")).strip()

        if not doctor_id or not workflow or not code:
            continue

        doctor_map.setdefault(doctor_id, {})

        if workflow == "annotation":
            doctor_map[doctor_id]["annotation"] = code
        elif workflow == "review":
            doctor_map[doctor_id]["review"] = code

print(f"Loaded doctor mappings: {len(doctor_map)}")

# 2. 修复 access_review_code.csv
review_rows = []

with review_path.open(newline="", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    fieldnames = reader.fieldnames

    if not fieldnames:
        raise ValueError("access_review_code.csv has no header.")

    for r in reader:
        doctor_id = str(r.get("doctor_id", "")).strip()
        mapping = doctor_map.get(doctor_id)

        if mapping:
            if mapping.get("annotation"):
                r["annotation_code"] = mapping["annotation"]
            if mapping.get("review"):
                r["review_code"] = mapping["review"]

        review_rows.append(r)

with review_path.open("w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(review_rows)

print(f"Updated {review_path}")

# 3. 修复 assigned_650_cases_by_access_code.csv
assigned_rows = []

with assigned_path.open(newline="", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    fieldnames = reader.fieldnames

    if not fieldnames:
        raise ValueError("assigned_650_cases_by_access_code.csv has no header.")

    for r in reader:
        doctor_id = str(r.get("doctor_id", "")).strip()
        mapping = doctor_map.get(doctor_id)

        if mapping:
            if mapping.get("annotation"):
                r["annotation_code"] = mapping["annotation"]
            if mapping.get("review"):
                r["review_code"] = mapping["review"]

        assigned_rows.append(r)

with assigned_path.open("w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(assigned_rows)

print(f"Updated {assigned_path}")

# 4. 简单检查重点 doctor
def count_assigned(doctor_id: str, annotation_code: str, review_code: str) -> int:
    count = 0
    with assigned_path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for r in reader:
            if (
                str(r.get("doctor_id", "")).strip() == doctor_id
                and str(r.get("annotation_code", "")).strip() == annotation_code
                and str(r.get("review_code", "")).strip() == review_code
            ):
                count += 1
    return count

print("Check doctor_15,2295,1775:", count_assigned("doctor_15", "2295", "1775"))
print("Check doctor_26,2413,7562:", count_assigned("doctor_26", "2413", "7562"))

print("Done.")