import type { LabData } from "@/lib/types";

export type DatasetSource = "stanford_mpog" | "mover";

export type CsvRow = Record<string, any>;

export type LoadedDashboardCase = {
  source: DatasetSource;

  caseId: string;

  caseInfo: CsvRow;
  patientAttr: CsvRow;
  caseStatic: CsvRow;
  caseDynamicRows: CsvRow[];

  preopRow: CsvRow;
  preopHistoryRows: CsvRow[];

  /**
   * Lab 的原始格式在 Stanford 和 MOVER 中不同，
   * 所以由各自 loader 负责调用 prepareLabData。
   */
  labData: LabData | null;

  vitalRows: CsvRow[];
  gasRows: CsvRow[];
  ventilationRows: CsvRow[];
  cvRows: CsvRow[];
  temperatureRows: CsvRow[];

  medBolusRows: CsvRow[];
  medInfusionRows: CsvRow[];

  fluidInRows: CsvRow[];
  fluidOutRows: CsvRow[];

  managementRows: CsvRow[];
};
