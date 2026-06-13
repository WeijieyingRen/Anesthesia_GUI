export const STANFORD_DATASET_ROOT = "stanford_mpog";
export const MOVER_DATASET_ROOT = "mover";

export const STANFORD_DATASET_BASE = `/${STANFORD_DATASET_ROOT}`;
export const MOVER_DATASET_BASE = `/${MOVER_DATASET_ROOT}`;

/**
 * Backward-compatible aliases.
 *
 * 旧代码仍然使用 DATASET_ROOT / DATASET_BASE，
 * 这些旧入口继续默认指向 Stanford MPOG 数据。
 *
 * 新的双数据集 loader 应分别使用：
 * - STANFORD_DATASET_BASE
 * - MOVER_DATASET_BASE
 */
export const DATASET_ROOT = STANFORD_DATASET_ROOT;
export const DATASET_BASE = STANFORD_DATASET_BASE;