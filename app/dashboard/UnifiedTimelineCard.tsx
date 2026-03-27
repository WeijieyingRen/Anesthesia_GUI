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
import FluidChart from "./FluidChart";
import VentilationChart from "./VentilationChart";

type DetectVital = "MAP" | "HR" | "SPO2" | "RR" | "ETCO2" | "TEMP";
type TimeResolution = 15 | 5 | 1;

type SelectedWindow = {
  vital: DetectVital;
  startMin: number;
  endMin: number;
  y1: number;
  y2: number;
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

  selectedWindow: SelectedWindow | null;
  onChangeSelectedWindow: (window: SelectedWindow | null) => void;
  onCreateEventFromWindow: (window: SelectedWindow) => void;

  sharedScrollLeft?: number;
  onSharedScrollLeftChange?: (scrollLeft: number) => void;
};

type SectionKey =
  | "vitals"
  | "medications"
  | "fluids"
  | "gas"
  | "ventilation"
  | "tmp"
  | "cv";

function formatClockTime(offsetMin: number, timeZero?: string | null) {
  if (!timeZero) return String(offsetMin);

  const base = new Date(timeZero);
  if (Number.isNaN(base.getTime())) return String(offsetMin);

  const dt = new Date(base.getTime() + offsetMin * 60000);
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
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
    </div>
  );
}

function SharedViewportBar({
  show,
  timelineEnd,
  viewStartMin,
  viewWindowWidthMin,
  onChangeViewStartMin,
  anesthesiaStart,
}: {
  show: boolean;
  timelineEnd: number;
  viewStartMin: number;
  viewWindowWidthMin: number;
  onChangeViewStartMin: (value: number) => void;
  anesthesiaStart: string | null;
}) {
  if (!show) return null;

  const maxStart = Math.max(0, timelineEnd - viewWindowWidthMin);
  const viewEndMin = Math.min(timelineEnd, viewStartMin + viewWindowWidthMin);

  return (
    <div className="border-t bg-white px-4 py-3">
      <div className="mb-2 flex items-center justify-between text-xs text-gray-600">
        <span>
          Window: {formatClockTime(viewStartMin, anesthesiaStart)} –{" "}
          {formatClockTime(viewEndMin, anesthesiaStart)}
        </span>
        <span>Drag to pan across the case</span>
      </div>

      <input
        type="range"
        min={0}
        max={maxStart}
        step={1}
        value={Math.min(viewStartMin, maxStart)}
        onChange={(e) => onChangeViewStartMin(Number(e.target.value))}
        className="h-2 w-full cursor-pointer accent-blue-600"
      />

      <div className="mt-2 flex justify-between text-[11px] text-gray-500">
        <span>{formatClockTime(0, anesthesiaStart)}</span>
        <span>{formatClockTime(timelineEnd, anesthesiaStart)}</span>
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
  anesthesiaStop,
  timelineEnd,
  ticks,
  timeResolution,
  onChangeTimeResolution,
  viewStartMin,
  onChangeViewStartMin,
  viewWindowWidthMin,
  selectedDetectVital,
  onChangeSelectedDetectVital,
  selectedWindow,
  onChangeSelectedWindow,
  onCreateEventFromWindow,
  sharedScrollLeft,
  onSharedScrollLeftChange,
}: UnifiedTimelineCardProps) {
  const [openSections, setOpenSections] = React.useState<Record<SectionKey, boolean>>({
    vitals: true,
    medications: true,
    fluids: true,
    gas: true,
    ventilation: true,
    tmp: true,
    cv: true,
  });

  const viewEndMin = React.useMemo(
    () => Math.min(timelineEnd, viewStartMin + viewWindowWidthMin),
    [timelineEnd, viewStartMin, viewWindowWidthMin]
  );

  const showViewportBar = timeResolution === 5 || timeResolution === 1;

  React.useEffect(() => {
    const maxStart = Math.max(0, timelineEnd - viewWindowWidthMin);
    if (viewStartMin > maxStart) {
      onChangeViewStartMin(maxStart);
    }
  }, [timelineEnd, viewWindowWidthMin, viewStartMin, onChangeViewStartMin]);

  function toggleSection(section: SectionKey) {
    setOpenSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  }

  const sharedHighlightWindow = selectedWindow
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
            windowSize={15}
            xEnd={timelineEnd}
            xTicks={ticks}
            showXAxis={false}
            timeZero={anesthesiaStart}
            embedded
            highlightWindow={sharedHighlightWindow}
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
        <MedicationChart
          title=""
          medications={medications}
          height={280}
          xEnd={timelineEnd}
          xTicks={ticks}
          showXAxis={false}
          timeZero={anesthesiaStart}
          embedded
          highlightWindow={sharedHighlightWindow}
          sharedScrollLeft={sharedScrollLeft}
          onSharedScrollLeftChange={onSharedScrollLeftChange}
        />
      )}

      <SectionHeader
        title="Vitals"
        open={openSections.vitals}
        onToggle={() => toggleSection("vitals")}
      >
        {(["MAP", "HR", "SPO2", "RR", "ETCO2"] as const).map((item) => {
          const active = selectedDetectVital === item;

          return (
            <button
              key={item}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChangeSelectedDetectVital(item);

                if (selectedWindow) {
                  onChangeSelectedWindow({
                    ...selectedWindow,
                    vital: item,
                  });
                }
              }}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                active
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {item}
            </button>
          );
        })}
      </SectionHeader>

      {openSections.vitals && (
        <div className="max-h-[380px] overflow-y-scroll [scrollbar-gutter:stable]">
          <VitalChart
            title=""
            yDomain={[0, 220]}
            xEnd={timelineEnd}
            xTicks={ticks}
            showTopTimeAxis
            timeZero={anesthesiaStart}
            embedded
            selectedDetectVital={selectedDetectVital}
            onChangeSelectedDetectVital={onChangeSelectedDetectVital}
            selectedWindow={selectedWindow}
            onChangeSelectedWindow={onChangeSelectedWindow}
            onCreateEventFromWindow={onCreateEventFromWindow}
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
              NIBP_SBP: "triangle",
              NIBP_DBP: "triangle-down",
              NIBP_MAP: "x",
              "SPO2 %": "square",
              RR: "circle",
              "ETCO2 (mmHg)": "diamond",
              ARTS: "triangle",
              ARTD: "triangle-down",
              ARTM: "x",
              CVP: "square",
              "PSI/BIS/Entropy": "diamond",
            }}
            height={370}
          />
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
            height={190}
            xEnd={timelineEnd}
            xTicks={ticks}
            showXAxis={false}
            timeZero={anesthesiaStart}
            embedded
            highlightWindow={sharedHighlightWindow}
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
            sharedScrollLeft={sharedScrollLeft}
            onSharedScrollLeftChange={onSharedScrollLeftChange}
          />
        </div>
      )}

      <SectionHeader
        title="TMP"
        open={openSections.tmp}
        onToggle={() => toggleSection("tmp")}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChangeSelectedDetectVital("TEMP");

            if (selectedWindow) {
              onChangeSelectedWindow({
                ...selectedWindow,
                vital: "TEMP",
              });
            }
          }}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
            selectedDetectVital === "TEMP"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          }`}
        >
          TEMP
        </button>
      </SectionHeader>

      {openSections.tmp && (
        <div className="overflow-visible">
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
            showXAxis={false}
            timeZero={anesthesiaStart}
            embedded
            selectedWindow={selectedWindow}
            onChangeSelectedWindow={onChangeSelectedWindow}
            onCreateEventFromWindow={onCreateEventFromWindow}
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
            sharedScrollLeft={sharedScrollLeft}
            onSharedScrollLeftChange={onSharedScrollLeftChange}
          />
        </div>
      )}

      <SharedViewportBar
        show={showViewportBar}
        timelineEnd={timelineEnd}
        viewStartMin={viewStartMin}
        viewWindowWidthMin={viewWindowWidthMin}
        onChangeViewStartMin={onChangeViewStartMin}
        anesthesiaStart={anesthesiaStart}
      />
    </div>
  );
}