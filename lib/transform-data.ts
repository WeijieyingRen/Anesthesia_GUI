// lib/transform-data.ts
import type {
  RawPatientData,
  VitalsData,
  PatientContext,
  AirwayData,
  AccessData,
  FluidsBloodData,
  IntraopBolusData,
} from "./types";
// ---- helpers ----
const num = (v: any) => (v === null || v === undefined || v === "" ? NaN : Number(v));

// function mkSeries(times: number[], values: (number | string | null | undefined)[]) {
//   const out: { time: number; value: number }[] = [];
//   const n = Math.min(times.length, values.length);
//   for (let i = 0; i < n; i++) {
//     const v = num(values[i]);
//     if (Number.isFinite(v)) out.push({ time: Number(times[i]), value: v });
//   }
//   return out;
// }

function mkSeries(times: number[], values: (number | string | null | undefined)[]) {
  const out: { time: number; value: number }[] = [];
  const n = Math.min(times.length, values.length);
  for (let i = 0; i < n; i++) {
    const v = num(values[i]);
    // keep zeros!
    if (!Number.isNaN(v)) out.push({ time: Number(times[i]), value: v });
  }
  return out;
}

const lastFinite = (arr: number[]) => {
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i];
    if (Number.isFinite(v)) return v;
  }
  return null;
};

// ---- main ----
export function prepareVitalsData(rawData: RawPatientData): VitalsData {
  if (!rawData || !rawData.vitals) {
    throw new Error("Invalid input: rawData with vitals is required");
  }
  const patient = rawData.patient
  const v = rawData.vitals.values ?? {};
  const t =
    v.time ??
    v.time_index_minutes ??
    v.time_index ??
    v.minute ??
    [];

  // --- Core vitals ---
// --- Core vitals (raw arrays) ---
const raw_dbp = v.phys_dbp ?? [];
const raw_sbp = v.phys_sbp ?? [];
const raw_map = v.phys_map ?? [];
const raw_spo2 = v.phys_spo2 ?? [];
const raw_etco2 = v.phys_etco2 ?? [];
const raw_hr = v.phys_hr ?? [];

// --- Core vitals (time series for UI) ---
const dbp = mkSeries(t, raw_dbp);
const sbp = mkSeries(t, raw_sbp);
const map = mkSeries(t, raw_map);
const spo2 = mkSeries(t, raw_spo2);
const etco2 = mkSeries(t, raw_etco2);
const hr = mkSeries(t, raw_hr);


  // --- Gases (wave) ---
  const gases = {
    fio2:  mkSeries(t, v.gas_fio2  ?? []),
    feo2:  mkSeries(t, v.gas_feo2  ?? []),
    inco2: mkSeries(t, v.gas_inco2 ?? []),
  };

  const ventilation = {
    vent_rr:         mkSeries(t, v.vent_rr ?? []),
    vent_tv:         mkSeries(t, v.vent_tv ?? []),
    vent_mv:         mkSeries(t, v.vent_mv ?? []),
    vent_peep:       mkSeries(t, v.vent_peep ?? []),
    vent_pip:        mkSeries(t, v.vent_pip ?? []),
    vent_pplat:      mkSeries(t, v.vent_pplat ?? []),
    vent_compliance: mkSeries(t, v.vent_compliance ?? []),
  };
 
  const hemodynamics = {
    hemo_co:  mkSeries(t, v.hemo_co ?? []),
    hemo_ci:  mkSeries(t, v.hemo_ci ?? []),
    hemo_svr: mkSeries(t, v.hemo_svr ?? []),
    hemo_cvp: mkSeries(t, v.hemo_cvp ?? []),
    hemo_svv: mkSeries(t, v.hemo_svv ?? []),
  };
  
  const depth = {
    depth_bis: mkSeries(t, v.depth_bis ?? []),
    depth_sr:  mkSeries(t, v.depth_sr ?? []),
    depth_mac: mkSeries(t, v.depth_mac ?? []),
  };
  
   // ---------- NEW: static intraoperative context ----------
   const airway: AirwayData = {
    airway: v.airway,
    tubesize: v.tubesize,
    dltubesize: v.dltubesize,
    lmasize: v.lmasize,
  };

  const access: AccessData = {
    iv1: v.iv1,
    iv2: v.iv2,
    aline1: v.aline1,
    aline2: v.aline2,
    cline1: v.cline1,
    cline2: v.cline2,
  };

  const fluids_blood: FluidsBloodData = {
    intraop_ebl: v.intraop_ebl,
    intraop_uo: v.intraop_uo,
    intraop_crystalloid: v.intraop_crystalloid,
    intraop_colloid: v.intraop_colloid,
    intraop_rbc: v.intraop_rbc,
    intraop_ffp: v.intraop_ffp,
  };

  const intraop_bolus: IntraopBolusData = {
    intraop_ppf: v.intraop_ppf,
    intraop_mdz: v.intraop_mdz,
    intraop_ftn: v.intraop_ftn,
    intraop_rocu: v.intraop_rocu,
    intraop_vecu: v.intraop_vecu,
    intraop_eph: v.intraop_eph,
    intraop_phe: v.intraop_phe,
    intraop_epi: v.intraop_epi,
    intraop_ca: v.intraop_ca,
  };

  // --- Medications (continuous / infusion waves, NOT bolus) ---
  const meds = {
    pressors: {
      vasopressors_norepinephrine: mkSeries(t, v.vasopressors_norepinephrine ?? []),
      vasopressors_phenylephrine: mkSeries(t, v.vasopressors_phenylephrine ?? []),
      vasopressors_vasopressin:   mkSeries(t, v.vasopressors_vasopressin ?? []),
      vasopressors_epinephrine:   mkSeries(t, v.vasopressors_epinephrine ?? []),
  
    },
    vasodilators: {
      vasodilators_nitroglycerin:        mkSeries(t, v.vasodilators_nitroglycerin ?? []),
      vasodilators_sodium_nitroprusside: mkSeries(t, v.vasodilators_sodium_nitroprusside ?? []),
  
    },
    inotropes: {
      inotropes_dobutamine:       mkSeries(t, v.inotropes_dobutamine ?? []),
      inotropes_dopamine:         mkSeries(t, v.inotropes_dopamine ?? []),
      inotropes_milrinone:        mkSeries(t, v.inotropes_milrinone ?? []),
      inotropes_prostaglandin_e1: mkSeries(t, v.inotropes_prostaglandin_e1 ?? []),
  
    },
    sedatives: {
      sedatives_propofol:               mkSeries(t, v.sedatives_propofol ?? []),
      sedatives_dexmedetomidine_low:    mkSeries(t, v.sedatives_dexmedetomidine_low ?? []),
      sedatives_dexmedetomidine_high:   mkSeries(t, v.sedatives_dexmedetomidine_high ?? []),
  
    },
    opioids: {
      opioids_remifentanil_low:  mkSeries(t, v.opioids_remifentanil_low ?? []),
      opioids_remifentanil_high: mkSeries(t, v.opioids_remifentanil_high ?? []),
  
    },
    nmbas: {    
      nmbas_rocuronium:  mkSeries(t, v.nmbas_rocuronium ?? []),
      nmbas_vecuronium:  mkSeries(t, v.nmbas_vecuronium ?? []),
  }
};


const context: PatientContext = {
  airway,
  access,
  fluids_blood,
  intraop_bolus,
};

  // --- Current values (optional snapshot) ---
  const currentValues = {
    SBP: lastFinite(raw_sbp.map(num)),
    DBP: lastFinite(raw_dbp.map(num)),
    MAP: lastFinite(raw_map.map(num)),
    HR: lastFinite(raw_hr.map(num)),
    SpO2: lastFinite(raw_spo2.map(num)),
    ETCO2: lastFinite(raw_etco2.map(num)),
  };
  
  return {
    patient,
    SBP: sbp,
    DBP: dbp,
    MAP: map,
    HR: hr,
    SpO2: spo2,
    ETCO2: etco2,
    gases,
    ventilation,
    hemodynamics,
    depth,
    meds,
    currentValues,
  };
  
}
