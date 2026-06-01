import os
import pandas as pd
from collections import Counter, defaultdict

# ============================================================
# 1. 路径设置
# ============================================================
PROJECT_ROOT = os.getcwd()

DATA_ROOT = os.path.join(
    PROJECT_ROOT,
    "gui_selected_650"
)

OUT_DIR = os.path.join(DATA_ROOT, "_event_distribution")
os.makedirs(OUT_DIR, exist_ok=True)

CASE_STATIC_FILE = "case_static.csv"
CASE_DYNAMIC_FILE = "case_dynamic_events.csv"


# ============================================================
# 2. 工具函数
# ============================================================
def is_valid_value(x):
    if x is None:
        return False

    try:
        if pd.isna(x):
            return False
    except Exception:
        pass

    text = str(x).strip()
    if text == "":
        return False

    if text.lower() in {
        "nan",
        "none",
        "null",
        "undefined",
        "-",
    }:
        return False

    return True


def is_positive_flag(x):
    if not is_valid_value(x):
        return False

    text = str(x).strip().lower()
    return text in {"1", "1.0", "true", "yes", "y"}


def safe_read_csv(path):
    try:
        if not os.path.exists(path):
            return None

        df = pd.read_csv(path)
        if df.empty:
            return pd.DataFrame()

        return df
    except Exception as e:
        print(f"[WARN] Failed to read {path}: {e}")
        return None


def find_patient_folders(data_root):
    folders = []

    if not os.path.exists(data_root):
        return folders

    for name in sorted(os.listdir(data_root)):
        path = os.path.join(data_root, name)

        if not os.path.isdir(path):
            continue

        if not name.startswith("patient_"):
            continue

        has_static = os.path.exists(os.path.join(path, CASE_STATIC_FILE))
        has_dynamic = os.path.exists(os.path.join(path, CASE_DYNAMIC_FILE))

        if has_static or has_dynamic:
            folders.append(path)

    return folders


# ============================================================
# 3. case_static 字段分类
# ============================================================
STATIC_TIME_COLUMNS = [
    "anesthetist_ready",
    "anesthesia_start",
    "induction",
    "intubation",
    "procedure_start",
    "procedure_end",
    "extubation",
    "anesthesia_stop",
    "emergence",
    "anesthesia_timeout",
    "lma_inserted",
    "lma_removed",
    "block_start",
    "block_complete",
    "block_stop",
    "anesthesia_end",
]

STATIC_CONTEXT_COLUMNS = [
    "anesthesia_type_raw",
    "anesthesia_type_primary",
    "airway_type",
    "airway",
    "o2_delivery_for_mac_raw",
    "destination",
]

STATIC_FLAG_COLUMNS = [
    "has_intubation",
    "has_extubation",
    "has_extubated_awake",
    "has_extubated_deep",
    "has_lma_inserted",
    "has_lma_removed",
    "has_one_lung_ventilation",
    "has_two_lung_ventilation",
    "has_jet_ventilation",
    "has_bronchoscopy",
    "has_peripheral_nerve_block",
    "has_nerve_block_catheter",
    "has_neuraxial_block",
    "has_spinal_block",
    "has_epidural_block",
    "has_cse_block",
    "has_eye_block",
    "has_anesthesia_block_spinal",
    "has_anesthesia_block_epidural",
    "has_arterial_line",
    "has_central_line",
    "has_pa_cath",
    "has_lumbar_drain",
    "has_aortic_cannula",
    "has_blood_warmer",
    "has_tee",
    "has_tte",
    "has_cooling_started",
    "has_intentional_hypothermia",
    "has_defibrillation",
    "has_cpr",
    "has_circulatory_arrest",
    "has_data_artifact",
    "has_quick_note",
    "has_difficult_iv_placement",
    "has_abx_not_indicated",
    "has_general",
    "has_mac",
    "has_moderate_sedation",
    "has_local",
    "has_block",
    "has_spinal",
    "has_epidural",
    "has_regional",
    "has_other_anesthesia_type",
]


# ============================================================
# 4. 主统计函数
# ============================================================
def main():
    patient_folders = find_patient_folders(DATA_ROOT)
    total_cases = len(patient_folders)

    print("=" * 80)
    print(f"DATA_ROOT: {DATA_ROOT}")
    print(f"Found patient folders: {total_cases}")
    print("=" * 80)

    if total_cases == 0:
        print("No patient folders found. Please check DATA_ROOT.")
        return

    static_time_counter = Counter()
    static_context_counter = Counter()
    static_flag_positive_counter = Counter()

    static_context_value_counter = defaultdict(Counter)
    static_example_values = defaultdict(set)

    dynamic_event_type_counter = Counter()
    dynamic_event_type_case_counter = defaultdict(set)
    dynamic_event_group_counter = Counter()
    dynamic_event_label_counter = Counter()
    dynamic_event_type_label_examples = defaultdict(set)
    dynamic_event_type_value_examples = defaultdict(set)

    dynamic_columns_set = set()
    static_columns_set = set()

    for folder in patient_folders:
        patient_id = os.path.basename(folder)

        static_path = os.path.join(folder, CASE_STATIC_FILE)
        dynamic_path = os.path.join(folder, CASE_DYNAMIC_FILE)

        # ====================================================
        # case_static.csv
        # ====================================================
        df_static = safe_read_csv(static_path)

        if df_static is not None and not df_static.empty:
            row = df_static.iloc[0].to_dict()
            static_columns_set.update(df_static.columns.tolist())

            for col in STATIC_TIME_COLUMNS:
                if col not in row:
                    continue

                value = row.get(col)
                if is_valid_value(value):
                    static_time_counter[col] += 1
                    if len(static_example_values[col]) < 5:
                        static_example_values[col].add(str(value))

            for col in STATIC_CONTEXT_COLUMNS:
                if col not in row:
                    continue

                value = row.get(col)
                if is_valid_value(value):
                    static_context_counter[col] += 1
                    static_context_value_counter[col][str(value).strip()] += 1

                    if len(static_example_values[col]) < 10:
                        static_example_values[col].add(str(value))

            for col in STATIC_FLAG_COLUMNS:
                if col not in row:
                    continue

                value = row.get(col)
                if is_positive_flag(value):
                    static_flag_positive_counter[col] += 1
                    if len(static_example_values[col]) < 5:
                        static_example_values[col].add(str(value))

        # ====================================================
        # case_dynamic_events.csv
        # ====================================================
        df_dynamic = safe_read_csv(dynamic_path)

        if df_dynamic is not None and not df_dynamic.empty:
            dynamic_columns_set.update(df_dynamic.columns.tolist())

            for _, row in df_dynamic.iterrows():
                event_type = None

                for candidate_col in [
                    "event_type",
                    "event_name",
                    "type",
                    "name",
                ]:
                    if candidate_col in row and is_valid_value(row[candidate_col]):
                        event_type = str(row[candidate_col]).strip()
                        break

                if not event_type:
                    event_type = "unknown_event"

                group = ""
                for candidate_col in [
                    "group",
                    "event_group",
                    "category",
                ]:
                    if candidate_col in row and is_valid_value(row[candidate_col]):
                        group = str(row[candidate_col]).strip()
                        break

                label = ""
                for candidate_col in [
                    "label",
                    "event_label",
                    "display_label",
                ]:
                    if candidate_col in row and is_valid_value(row[candidate_col]):
                        label = str(row[candidate_col]).strip()
                        break

                value = ""
                for candidate_col in [
                    "event_value",
                    "raw_value",
                    "value",
                ]:
                    if candidate_col in row and is_valid_value(row[candidate_col]):
                        value = str(row[candidate_col]).strip()
                        break

                dynamic_event_type_counter[event_type] += 1
                dynamic_event_type_case_counter[event_type].add(patient_id)

                if group:
                    dynamic_event_group_counter[group] += 1

                if label:
                    dynamic_event_label_counter[label] += 1
                    if len(dynamic_event_type_label_examples[event_type]) < 10:
                        dynamic_event_type_label_examples[event_type].add(label)

                if value:
                    if len(dynamic_event_type_value_examples[event_type]) < 10:
                        dynamic_event_type_value_examples[event_type].add(value)

    # ========================================================
    # 5. static time distribution
    # ========================================================
    static_time_rows = []
    for col, count in static_time_counter.most_common():
        static_time_rows.append({
            "source": "case_static",
            "event_kind": "time",
            "event_name": col,
            "case_count": count,
            "case_percent": round(count / total_cases * 100, 2),
            "example_values": " | ".join(sorted(static_example_values[col])),
        })

    df_static_time = pd.DataFrame(static_time_rows)

    # ========================================================
    # 6. static context distribution
    # ========================================================
    static_context_rows = []
    for col, count in static_context_counter.most_common():
        top_values = static_context_value_counter[col].most_common(10)

        static_context_rows.append({
            "source": "case_static",
            "event_kind": "context",
            "event_name": col,
            "case_count": count,
            "case_percent": round(count / total_cases * 100, 2),
            "top_values": " | ".join(
                [f"{value} ({n})" for value, n in top_values]
            ),
            "example_values": " | ".join(sorted(static_example_values[col])),
        })

    df_static_context = pd.DataFrame(static_context_rows)

    # ========================================================
    # 7. static positive flag distribution
    # ========================================================
    static_flag_rows = []
    for col, count in static_flag_positive_counter.most_common():
        static_flag_rows.append({
            "source": "case_static",
            "event_kind": "flag",
            "event_name": col,
            "positive_case_count": count,
            "positive_case_percent": round(count / total_cases * 100, 2),
            "example_values": " | ".join(sorted(static_example_values[col])),
        })

    df_static_flag = pd.DataFrame(static_flag_rows)

    # ========================================================
    # 8. dynamic event distribution
    # ========================================================
    dynamic_rows = []

    for event_type, row_count in dynamic_event_type_counter.most_common():
        case_count = len(dynamic_event_type_case_counter[event_type])

        dynamic_rows.append({
            "source": "case_dynamic_events",
            "event_type": event_type,
            "row_count": row_count,
            "case_count": case_count,
            "case_percent": round(case_count / total_cases * 100, 2),
            "example_labels": " | ".join(
                sorted(dynamic_event_type_label_examples[event_type])
            ),
            "example_values": " | ".join(
                sorted(dynamic_event_type_value_examples[event_type])
            ),
        })

    df_dynamic = pd.DataFrame(dynamic_rows)

    df_dynamic_group = pd.DataFrame([
        {
            "group": group,
            "row_count": count,
        }
        for group, count in dynamic_event_group_counter.most_common()
    ])

    df_dynamic_label = pd.DataFrame([
        {
            "label": label,
            "row_count": count,
        }
        for label, count in dynamic_event_label_counter.most_common()
    ])

    # ========================================================
    # 9. 打印 set
    # ========================================================
    print("\n" + "=" * 80)
    print("case_static columns set")
    print("=" * 80)
    print(sorted(static_columns_set))

    print("\n" + "=" * 80)
    print("case_dynamic_events columns set")
    print("=" * 80)
    print(sorted(dynamic_columns_set))

    print("\n" + "=" * 80)
    print("case_static time event set")
    print("=" * 80)
    print(sorted(static_time_counter.keys()))

    print("\n" + "=" * 80)
    print("case_static context field set")
    print("=" * 80)
    print(sorted(static_context_counter.keys()))

    print("\n" + "=" * 80)
    print("case_static positive flag set")
    print("=" * 80)
    print(sorted(static_flag_positive_counter.keys()))

    print("\n" + "=" * 80)
    print("case_dynamic event_type set")
    print("=" * 80)
    print(sorted(dynamic_event_type_counter.keys()))

    print("\n" + "=" * 80)
    print("case_dynamic group set")
    print("=" * 80)
    print(sorted(dynamic_event_group_counter.keys()))

    # ========================================================
    # 10. 打印 distribution
    # ========================================================
    print("\n" + "=" * 80)
    print("case_static time distribution")
    print("=" * 80)
    if not df_static_time.empty:
        print(df_static_time.to_string(index=False))
    else:
        print("No static time events found.")

    print("\n" + "=" * 80)
    print("case_static context distribution")
    print("=" * 80)
    if not df_static_context.empty:
        print(df_static_context.to_string(index=False))
    else:
        print("No static context fields found.")

    print("\n" + "=" * 80)
    print("case_static positive flag distribution")
    print("=" * 80)
    if not df_static_flag.empty:
        print(df_static_flag.to_string(index=False))
    else:
        print("No positive static flags found.")

    print("\n" + "=" * 80)
    print("case_dynamic event_type distribution")
    print("=" * 80)
    if not df_dynamic.empty:
        print(df_dynamic.to_string(index=False))
    else:
        print("No dynamic events found.")

    print("\n" + "=" * 80)
    print("case_dynamic group distribution")
    print("=" * 80)
    if not df_dynamic_group.empty:
        print(df_dynamic_group.to_string(index=False))
    else:
        print("No dynamic groups found.")

    # ========================================================
    # 11. 只保存一个 TXT 汇总文件
    # ========================================================
    txt_out = os.path.join(OUT_DIR, "event_distribution_summary.txt")

    with open(txt_out, "w", encoding="utf-8") as f:
        def write_section(title, content):
            f.write("\n" + "=" * 80 + "\n")
            f.write(title + "\n")
            f.write("=" * 80 + "\n")
            f.write(str(content) + "\n")

        write_section("DATA_ROOT", DATA_ROOT)
        write_section("TOTAL_CASES", total_cases)

        write_section(
            "case_static columns set",
            sorted(static_columns_set)
        )

        write_section(
            "case_dynamic_events columns set",
            sorted(dynamic_columns_set)
        )

        write_section(
            "case_static time event set",
            sorted(static_time_counter.keys())
        )

        write_section(
            "case_static context field set",
            sorted(static_context_counter.keys())
        )

        write_section(
            "case_static positive flag set",
            sorted(static_flag_positive_counter.keys())
        )

        write_section(
            "case_dynamic event_type set",
            sorted(dynamic_event_type_counter.keys())
        )

        write_section(
            "case_dynamic group set",
            sorted(dynamic_event_group_counter.keys())
        )

        write_section(
            "case_static time distribution",
            df_static_time.to_string(index=False)
            if not df_static_time.empty
            else "No static time events found."
        )

        write_section(
            "case_static context distribution",
            df_static_context.to_string(index=False)
            if not df_static_context.empty
            else "No static context fields found."
        )

        write_section(
            "case_static positive flag distribution",
            df_static_flag.to_string(index=False)
            if not df_static_flag.empty
            else "No positive static flags found."
        )

        write_section(
            "case_dynamic event_type distribution",
            df_dynamic.to_string(index=False)
            if not df_dynamic.empty
            else "No dynamic events found."
        )

        write_section(
            "case_dynamic group distribution",
            df_dynamic_group.to_string(index=False)
            if not df_dynamic_group.empty
            else "No dynamic groups found."
        )

        write_section(
            "case_dynamic label distribution",
            df_dynamic_label.to_string(index=False)
            if not df_dynamic_label.empty
            else "No dynamic labels found."
        )

    print("\n" + "=" * 80)
    print("Saved TXT file")
    print("=" * 80)
    print(txt_out)


if __name__ == "__main__":
    main()