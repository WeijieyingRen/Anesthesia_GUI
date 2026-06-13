import type {
  DatasetSource,
  LoadedDashboardCase,
} from "@/lib/loaders/dashboard-case-types";

import { loadStanfordDashboardCase } from "@/lib/loaders/stanford";
import { loadMoverDashboardCase } from "@/lib/loaders/mover";

/**
 * Dashboard 数据加载的统一入口。
 *
 * 这里只负责根据 source 选择对应的数据 loader。
 * Stanford 和 MOVER 的原始数据读取及字段标准化，
 * 分别由 stanford.ts 和 mover.ts 负责。
 */
export async function loadDashboardPatient(
  folder: string,
  source: DatasetSource = "stanford_mpog"
): Promise<LoadedDashboardCase> {
  switch (source) {
    case "stanford_mpog":
      return loadStanfordDashboardCase(folder);

    case "mover":
      return loadMoverDashboardCase(folder);

    default: {
      const unsupportedSource: never = source;

      throw new Error(
        `Unsupported dashboard dataset source: ${String(unsupportedSource)}`
      );
    }
  }
}