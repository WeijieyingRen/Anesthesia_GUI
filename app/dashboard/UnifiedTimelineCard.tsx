"use client";

import * as React from "react";
import VitalChart from "./VitalChart";
import MedicationChart from "./MedicationChart";
import GasChart from "./GasChart";
import TmpChart from "./TmpChart";
import CVChart from "./CVChart";
import type {
  MedicationPanelData,
  VitalPanelData,
  FluidPanelData,
} from "@/lib/types";
import type { ManagementEvent } from "@/lib/types_management";
import FluidChart from "./FluidChart";
import VentilationChart from "./VentilationChart";
import TimelineContextPanel from "./TimelineContextPanel";

import type { DetectVital } from "./annotation/types";

type TimeResolution = 15 | 5;

type SelectedWindow = {
  vital: DetectVital;
  startMin: number;
  endMin: number;
  y1: number;
  y2: number;
};

type HighlightWindow = {
  startMin: number;
  endMin: number;
};

type UnifiedTimelineCardProps = {
  vitals: VitalPanelData | null;
  medications: MedicationPanelData | null;
  fluids: FluidPanelData | null;
  gas: Record<string, any>;
  anesthesiaStart: string | null;
  anesthesiaStop: string | null;
  timelineEnd: number;
  ticks: number[];

  timeResolution: TimeResolution;
  onChangeTimeResolution: (value: TimeResolution) => void;
  viewStartMin: number;
  onChangeViewStartMin: (value: number) => void;
  viewWindowWidthMin: number;

  selectedDetectVital: DetectVital;
  onChangeSelectedDetectVital: (vital: DetectVital) => void;
  showVitalSelector?: boolean;

  selectedWindow: SelectedWindow | null;
  onChangeSelectedWindow: (window: SelectedWindow | null) => void;
  onCreateEventFromWindow: (window: SelectedWindow) => void;

  sharedScrollLeft?: number;
  onSharedScrollLeftChange?: (scrollLeft: number) => void;

  timelineContext: any;

  managementEvent?: ManagementEvent | null;
  readOnly?: boolean;
};

type SectionKey =
  | "vitals"
  | "medications"
  | "fluids"
  | "gas"
  | "ventilation"
  | "cv";

function formatClockTime(offsetMin: number, timeZero?: string | null) {
  if (!timeZero) return String(offsetMin);

  const base = new Date(timeZero);
  if (Number.isNaN(base.getTime())) return String(offsetMin);

  const roundedBase = new Date(base);
  const roundedMinutes = Math.floor(roundedBase.getMinutes() / 15) * 15;
  roundedBase.setMinutes(roundedMinutes, 0, 0);

  const dt = new Date(roundedBase.getTime() + offsetMin * 60000);
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function hasAnyFinitePoints(group: Record<string, any> | null | undefined) {
  if (!group) return false;

  return Object.values(group).some(
    (arr) =>
      Array.isArray(arr) &&
      arr.some((p: any) => Number.isFinite(p?.value))
  );
}

function hasAnyMedicationData(medications: MedicationPanelData | null) {
  if (!medications) return false;

  const hasBolus = Object.values(medications.bolus ?? {}).some(
    (arr) => Array.isArray(arr) && arr.length > 0
  );
  const hasInfusion = Object.values(medications.infusion ?? {}).some(
    (arr) => Array.isArray(arr) && arr.length > 0
  );

  return hasBolus || hasInfusion;
}

function hasAnyFluidData(fluids: FluidPanelData | null) {
  if (!fluids) return false;

  const hasBolus = Object.values(fluids.bolus ?? {}).some(
    (arr) => Array.isArray(arr) && arr.length > 0
  );
  const hasInfusion = Object.values(fluids.infusion ?? {}).some(
    (arr) => Array.isArray(arr) && arr.length > 0
  );
  const hasOutput = Object.values(fluids.output ?? {}).some(
    (arr) => Array.isArray(arr) && arr.length > 0
  );

  return hasBolus || hasInfusion || hasOutput;
}

function hasAnyGasData(gas: Record<string, any> | null | undefined) {
  if (!gas) return false;

  return Object.values(gas).some(
    (arr) =>
      Array.isArray(arr) &&
      arr.some((p: any) => Number.isFinite(p?.value))
  );
}

function SectionHeader({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center border-b bg-slate-50 px-4 py-1">
      <button
        type="button"
        onClick={onToggle}
        className="flex shrink-0 items-center gap-2 text-left"
      >
        <span className="text-2xl font-bold leading-none text-gray-500">
          {open ? "▾" : "▸"}
        </span>
        <span className="text-sm font-semibold text-gray-800">{title}</span>
      </button>

      {children ? (
        <div className="flex flex-1 justify-center">
          <div className="flex flex-wrap items-center gap-2">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

function ViewportToolbar({
  viewStartMin,
  viewEndMin,
  timelineEnd,
  anesthesiaStart,
  timeResolution,
  onChangeTimeResolution,
}: {
  timeResolution: TimeResolution;
  onChangeTimeResolution: (value: TimeResolution) => void;
  viewStartMin: number;
  viewEndMin: number;
  timelineEnd: number;
  anesthesiaStart: string | null;
}) {
  return (
    <div className="flex items-center justify-between border-b bg-white px-4 py-2">
      <div className="text-xs text-gray-600">
        <span className="font-medium">View:</span>{" "}
        {formatClockTime(viewStartMin, anesthesiaStart)} –{" "}
        {formatClockTime(viewEndMin, anesthesiaStart)}
        <span className="mx-2 text-gray-400">|</span>
        <span className="font-medium">Total:</span>{" "}
        {Math.round(timelineEnd)} min
      </div>

      <div className="flex items-center gap-2">
        {[15, 5].map((r) => {
          const active = timeResolution === r;
          return (
            <button
              key={r}
              type="button"
              onClick={() => onChangeTimeResolution(r as TimeResolution)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                active
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {r} min
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function UnifiedTimelineCard({
  vitals,
  medications,
  fluids,
  gas,
  anesthesiaStart,
  timelineEnd,
  ticks,
  timeResolution,
  onChangeTimeResolution,
  viewStartMin,
  onChangeViewStartMin,
  viewWindowWidthMin,
  selectedDetectVital,
  onChangeSelectedDetectVital,
  showVitalSelector = true,
  selectedWindow,
  onChangeSelectedWindow,
  onCreateEventFromWindow,
  sharedScrollLeft,
  onSharedScrollLeftChange,
  timelineContext,
  managementEvent = null,
  readOnly = false,
}: UnifiedTimelineCardProps) {
  const hasVitalsData =
    hasAnyFinitePoints(vitals?.main) ||
    hasAnyFinitePoints(vitals?.tmp) ||
    hasAnyFinitePoints(vitals?.hemodynamics) ||
    hasAnyFinitePoints(vitals?.depth);

  const hasMedicationsData = hasAnyMedicationData(medications);
  const hasFluidsData = hasAnyFluidData(fluids);
  const hasGasData = hasAnyGasData(gas);
  const hasVentilationData = hasAnyFinitePoints(vitals?.ventilation);
  const hasCVData = hasAnyFinitePoints(vitals?.cv);

  const [openSections, setOpenSections] = React.useState<Record<SectionKey, boolean>>({
    vitals: hasVitalsData,
    medications: hasMedicationsData,
    fluids: hasFluidsData,
    gas: hasGasData,
    ventilation: hasVentilationData,
    cv: hasCVData,
  });

  React.useEffect(() => {
    setOpenSections({
      vitals: hasVitalsData,
      medications: hasMedicationsData,
      fluids: hasFluidsData,
      gas: hasGasData,
      ventilation: hasVentilationData,
      cv: hasCVData,
    });
  }, [
    hasVitalsData,
    hasMedicationsData,
    hasFluidsData,
    hasGasData,
    hasVentilationData,
    hasCVData,
  ]);

  React.useEffect(() => {
    if (!managementEvent) return;

    const chartType = String(managementEvent.chart_type ?? "").toLowerCase();

    if (chartType === "medication") {
      setOpenSections((prev) => ({
        ...prev,
        medications: true,
      }));
    }

    if (chartType === "gas") {
      setOpenSections((prev) => ({
        ...prev,
        gas: true,
      }));
    }
  }, [managementEvent]);

  const viewEndMin = React.useMemo(
    () => Math.min(timelineEnd, viewStartMin + viewWindowWidthMin),
    [timelineEnd, viewStartMin, viewWindowWidthMin]
  );

  React.useEffect(() => {
    const maxStart = Math.max(0, timelineEnd - viewWindowWidthMin);
    if (viewStartMin > maxStart) {
      onChangeViewStartMin(maxStart);
    }
  }, [timelineEnd, viewWindowWidthMin, viewStartMin, onChangeViewStartMin]);

  React.useEffect(() => {
    if (!managementEvent) return;
    if (!Number.isFinite(Number(managementEvent.time_min))) return;

    const start = Number(managementEvent.time_min);
    const maxStart = Math.max(0, timelineEnd - viewWindowWidthMin);

    const targetStart = Math.max(
      0,
      Math.min(maxStart, start - Math.floor(viewWindowWidthMin * 0.25))
    );

    onChangeViewStartMin(targetStart);
  }, [managementEvent, timelineEnd, viewWindowWidthMin, onChangeViewStartMin]);

  function toggleSection(section: SectionKey) {
    setOpenSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  }

  const vitalSelectedWindow =
    selectedWindow?.vital === "TEMP" ? null : selectedWindow;

  const tmpSelectedWindow =
    selectedWindow?.vital === "TEMP" ? selectedWindow : null;

  const managementHighlightWindow: HighlightWindow | null =
    managementEvent && Number.isFinite(Number(managementEvent.time_min))
      ? {
          startMin: Math.max(0, Number(managementEvent.time_min) - 10),
          endMin: Math.min(
            timelineEnd,
            Number(managementEvent.end_time_min ?? managementEvent.time_min) + 10
          ),
        }
      : null;

  const sharedHighlightWindow: HighlightWindow | null = managementHighlightWindow
    ? managementHighlightWindow
    : selectedWindow
      ? {
          startMin: selectedWindow.startMin,
          endMin: selectedWindow.endMin,
        }
      : null;

  return (
    <div className="overflow-visible border bg-white shadow-sm">
      <ViewportToolbar
        timeResolution={timeResolution}
        onChangeTimeResolution={onChangeTimeResolution}
        viewStartMin={viewStartMin}
        viewEndMin={viewEndMin}
        timelineEnd={timelineEnd}
        anesthesiaStart={anesthesiaStart}
      />

      <div className="border-t">
        <TimelineContextPanel
          context={timelineContext}
          xEnd={timelineEnd}
          xTicks={ticks}
          timeZero={anesthesiaStart}
          timeResolution={timeResolution}
          episodeWindow={
            selectedWindow
              ? {
                  startMin: selectedWindow.startMin,
                  endMin: selectedWindow.endMin,
                }
              : managementHighlightWindow
          }
          sharedScrollLeft={sharedScrollLeft}
          onSharedScrollLeftChange={onSharedScrollLeftChange}
        />
      </div>

      <SectionHeader
        title="Gas"
        open={openSections.gas}
        onToggle={() => toggleSection("gas")}
      />
      {openSections.gas && (
        <div className="overflow-visible">
          <GasChart
            title=""
            gas={gas}
            height={220}
            windowSize={timeResolution}
            xEnd={timelineEnd}
            xTicks={ticks}
            showXAxis={false}
            timeZero={anesthesiaStart}
            embedded
            highlightWindow={sharedHighlightWindow}
           
            timeResolution={timeResolution}
            sharedScrollLeft={sharedScrollLeft}
            onSharedScrollLeftChange={onSharedScrollLeftChange}
          />
        </div>
      )}

      <SectionHeader
        title="Medications"
        open={openSections.medications}
        onToggle={() => toggleSection("medications")}
      />
      {openSections.medications && (
        <div className="overflow-visible">
          <MedicationChart
            title=""
            medications={medications}
            height={300}
            xEnd={timelineEnd}
            xTicks={ticks}
            showXAxis={false}
            timeZero={anesthesiaStart}
            embedded
            highlightWindow={sharedHighlightWindow}
            managementEvent={managementEvent}
            timeResolution={timeResolution}
            sharedScrollLeft={sharedScrollLeft}
            onSharedScrollLeftChange={onSharedScrollLeftChange}
          />
        </div>
      )}

      <SectionHeader
        title="Vitals"
        open={openSections.vitals}
        onToggle={() => toggleSection("vitals")}
      />

      {openSections.vitals && (
        <div className="space-y-0">
          <div className="max-h-[380px] overflow-y-scroll [scrollbar-gutter:stable]">
            <VitalChart
              title=""
              yDomain={[0, 220]}
              xEnd={timelineEnd}
              xTicks={ticks}
              timeResolution={timeResolution}
              showTopTimeAxis
              timeZero={anesthesiaStart}
              embedded
              selectedDetectVital={selectedDetectVital}
              onChangeSelectedDetectVital={onChangeSelectedDetectVital}
              selectedWindow={vitalSelectedWindow}
              highlightWindow={sharedHighlightWindow}
              onChangeSelectedWindow={readOnly ? undefined : onChangeSelectedWindow}
              onCreateEventFromWindow={readOnly ? undefined : onCreateEventFromWindow}
              sharedScrollLeft={sharedScrollLeft}
              onSharedScrollLeftChange={onSharedScrollLeftChange}
              series={{
                HR: vitals?.main?.["HR"] ?? [],
                NIBP_SBP: vitals?.main?.["NIBP_SBP"] ?? [],
                NIBP_DBP: vitals?.main?.["NIBP_DBP"] ?? [],
                NIBP_MAP: vitals?.main?.["NIBP_MAP"] ?? [],
                "SPO2 %": vitals?.main?.["SPO2 %"] ?? [],
                RR: vitals?.main?.["RR"] ?? [],
                "ETCO2 (mmHg)": vitals?.main?.["ETCO2 (mmHg)"] ?? [],
                ARTS: vitals?.main?.["ARTS"] ?? [],
                ARTD: vitals?.main?.["ARTD"] ?? [],
                ARTM: vitals?.main?.["ARTM"] ?? [],
                CVP: vitals?.hemodynamics?.["CVP"] ?? [],
                "PSI/BIS/Entropy": vitals?.depth?.["PSI/BIS/Entropy"] ?? [],
              }}
              lineLabels={{
                HR: "HR",
                NIBP_SBP: "NIBP_SBP",
                NIBP_DBP: "NIBP_DBP",
                NIBP_MAP: "NIBP_MAP",
                "SPO2 %": "SPO2 %",
                RR: "RR",
                "ETCO2 (mmHg)": "ETCO2",
                ARTS: "ARTS",
                ARTD: "ARTD",
                ARTM: "ARTM",
                CVP: "CVP",
                "PSI/BIS/Entropy": "PSI/BIS/Entropy",
              }}
              lineUnits={{
                HR: "bpm",
                NIBP_SBP: "mmHg",
                NIBP_DBP: "mmHg",
                NIBP_MAP: "mmHg",
                "SPO2 %": "%",
                RR: "bpm",
                "ETCO2 (mmHg)": "mmHg",
                ARTS: "mmHg",
                ARTD: "mmHg",
                ARTM: "mmHg",
                CVP: "mmHg",
                "PSI/BIS/Entropy": "",
              }}
              lineColors={{
                HR: "#2f8f2f",
                NIBP_SBP: "#000000",
                NIBP_DBP: "#000000",
                NIBP_MAP: "#000000",
                "SPO2 %": "#1f2fff",
                RR: "#4a90ff",
                "ETCO2 (mmHg)": "#f59e0b",
                ARTS: "#ff2b2b",
                ARTD: "#ff2b2b",
                ARTM: "#ff2b2b",
                CVP: "#7a5cff",
                "PSI/BIS/Entropy": "#ff31c8",
              }}
              lineMarkers={{
                HR: "circle",
                NIBP_SBP: "triangle-down",
                NIBP_DBP: "triangle",
                NIBP_MAP: "x",
                "SPO2 %": "square",
                RR: "circle",
                "ETCO2 (mmHg)": "diamond",
                ARTS: "triangle-down",
                ARTD: "triangle",
                ARTM: "x",
                CVP: "square",
                "PSI/BIS/Entropy": "diamond",
              }}
              height={350}
            />
          </div>

          <div className="overflow-visible border-t">
            <TmpChart
              title=""
              tmp={{
                "TMP Bladder": vitals?.tmp?.["TMP Bladder"] ?? [],
                "TMP Blood": vitals?.tmp?.["TMP Blood"] ?? [],
                "TMP Esophageal": vitals?.tmp?.["TMP Esophageal"] ?? [],
                "TMP Nasopharyngeal": vitals?.tmp?.["TMP Nasopharyngeal"] ?? [],
                "TMP Rectal": vitals?.tmp?.["TMP Rectal"] ?? [],
              }}
              height={220}
              xEnd={timelineEnd}
              xTicks={ticks}
              timeResolution={timeResolution}
              showXAxis={false}
              timeZero={anesthesiaStart}
              embedded
              selectedWindow={tmpSelectedWindow}
              highlightWindow={sharedHighlightWindow}
              onChangeSelectedWindow={readOnly ? undefined : onChangeSelectedWindow}
              onCreateEventFromWindow={readOnly ? undefined : onCreateEventFromWindow}
              sharedScrollLeft={sharedScrollLeft}
              onSharedScrollLeftChange={onSharedScrollLeftChange}
            />
          </div>
        </div>
      )}

      <SectionHeader
        title="Fluid Events"
        open={openSections.fluids}
        onToggle={() => toggleSection("fluids")}
      />
      {openSections.fluids && (
        <div className="overflow-visible">
          <FluidChart
            title=""
            fluids={fluids}
            height={220}
            xEnd={timelineEnd}
            xTicks={ticks}
            showXAxis={false}
            timeZero={anesthesiaStart}
            embedded
            highlightWindow={sharedHighlightWindow}
            timeResolution={timeResolution}
            sharedScrollLeft={sharedScrollLeft}
            onSharedScrollLeftChange={onSharedScrollLeftChange}
          />
        </div>
      )}

      <SectionHeader
        title="CV"
        open={openSections.cv}
        onToggle={() => toggleSection("cv")}
      />
      {openSections.cv && (
        <div className="overflow-visible">
          <CVChart
            title=""
            cv={vitals?.cv ?? {}}
            xEnd={timelineEnd}
            xTicks={ticks}
            showXAxis={false}
            timeZero={anesthesiaStart}
            embedded
            highlightWindow={sharedHighlightWindow}
            timeResolution={timeResolution}
            sharedScrollLeft={sharedScrollLeft}
            onSharedScrollLeftChange={onSharedScrollLeftChange}
          />
        </div>
      )}

      <SectionHeader
        title="Ventilation"
        open={openSections.ventilation}
        onToggle={() => toggleSection("ventilation")}
      />
      {openSections.ventilation && (
        <div className="overflow-visible">
          <VentilationChart
            title=""
            ventilation={{
              RR: vitals?.ventilation?.["RR"] ?? [],
              TV: vitals?.ventilation?.["TV"] ?? [],
              MV: vitals?.ventilation?.["MV"] ?? [],
              "PEEP (cm H2O)": vitals?.ventilation?.["PEEP (cm H2O)"] ?? [],
              PIP: vitals?.ventilation?.["PIP"] ?? [],
              "Mean PIP": vitals?.ventilation?.["Mean PIP"] ?? [],
              "Plateau PIP": vitals?.ventilation?.["Plateau PIP"] ?? [],
            }}
            height={190}
            xEnd={timelineEnd}
            xTicks={ticks}
            showXAxis={false}
            timeZero={anesthesiaStart}
            embedded
            highlightWindow={sharedHighlightWindow}
            timeResolution={timeResolution}
            sharedScrollLeft={sharedScrollLeft}
            onSharedScrollLeftChange={onSharedScrollLeftChange}
          />
        </div>
      )}
    </div>
  );
}
