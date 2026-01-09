import type { PreopData } from "@/lib/types";


export function preparePreopData(
  headers: string[],
  firstRow: string[]
): PreopData {
  const lower = headers.map(h => h.toLowerCase());
  const get = (name: string) => {
    const idx = lower.indexOf(name);
    if (idx === -1) return undefined;
    const v = Number(firstRow[idx]);
    return Number.isFinite(v) ? v : undefined;
  };
  
  const getText = (name: string) => {
    const idx = lower.indexOf(name);
    if (idx === -1) return undefined;
    const v = firstRow[idx];
    return v && v.trim() !== "" ? v : undefined;
  };
  

  return {
    preop_htn: get("preop_htn"),
    preop_dm: get("preop_dm"),
    preop_ecg: getText("preop_ecg"),
    preop_pft: getText("preop_pft"),
    
  
    preop_hb: get("preop_hb"),
    preop_plt: get("preop_plt"),
    preop_pt: get("preop_pt"),
    preop_aptt: get("preop_aptt"),
    preop_na: get("preop_na"),
    preop_k: get("preop_k"),
    preop_gluc: get("preop_gluc"),
    preop_alb: get("preop_alb"),
    preop_ast: get("preop_ast"),
    preop_alt: get("preop_alt"),
    preop_bun: get("preop_bun"),
    preop_cr: get("preop_cr"),
    preop_ph: get("preop_ph"),
    preop_hco3: get("preop_hco3"),
    preop_be: get("preop_be"),
    preop_pao2: get("preop_pao2"),
    preop_paco2: get("preop_paco2"),
    preop_sao2: get("preop_sao2"),
  
  };
}
