"use client";

import * as React from "react";
import type {
  DetectAnnotation,
  DetectVital,
  SidebarEventItem,
  WorkspaceTaskKey,
  EventType,
} from "./types";
import type { TimeValuePoint } from "@/lib/types";
import DetectPanel from "./panels/DetectPanel";
import MechanismPanel from "./panels/MechanismPanel";
import FluidEvalPanel from "./panels/FluidEvalPanel";
import PreventedEpisodePanel from "./panels/PreventedEpisodePanel";

type SelectedWindow = {
  vital: DetectVital;
  startMin: number;
  endMin: number;
  y1: number;
  y2: number;
};

type TaskWorkspaceProps = {
  task: WorkspaceTaskKey;
  onChangeTask: (task: WorkspaceTaskKey) => void;
  onSaveAndNextStep: (task: WorkspaceTaskKey) => void;
  selectedEvent: SidebarEventItem | null;
  caseId?: string;
  selectedDetectVital: DetectVital;
  onChangeSelectedDetectVital: (vital: DetectVital) => void;
  selectedWindow: SelectedWindow | null;
  anesthesiaStart?: string | null;
  gasData?: Record<string, TimeValuePoint[] | undefined>;
  medBolusRows?: any[];
  medInfusionRows?: any[];
  fluidInRows?: any[];
  fluidOutRows?: any[];
};

function buildDefaultDetectAnnotation(params: {
  selectedWindow: SelectedWindow | null;
  selectedEvent: SidebarEventItem | null;
  selectedDetectVital: DetectVital;
  prev?: DetectAnnotation | null;
}): DetectAnnotation {
  const { selectedWindow, selectedEvent, selectedDetectVital, prev } = params;

  const resolvedVital =
    selectedWindow?.vital ?? prev?.vital ?? selectedDetectVital;

  return {
    vital: resolvedVital,
    primaryVitals:
      prev?.primaryVitals && prev.primaryVitals.length > 0
        ? prev.primaryVitals
        : [resolvedVital],

    startMin:
      selectedWindow?.startMin ?? selectedEvent?.startMin ?? prev?.startMin ?? 0,
    endMin:
      selectedWindow?.endMin ?? selectedEvent?.endMin ?? prev?.endMin ?? 0,

    shouldContinueAnnotation: prev?.shouldContinueAnnotation ?? "",

    eventType: prev?.eventType ?? "",
    eventTypeOther: prev?.eventTypeOther ?? "",

    associatedChanges: prev?.associatedChanges ?? "",
    note: prev?.note ?? "",

    onsetPattern: prev?.onsetPattern ?? "",
    episodeCourse: prev?.episodeCourse ?? "",

    severity: prev?.severity ?? "",
    confidence: prev?.confidence ?? null,
  };
}

export default function TaskWorkspace({
  task,
  onChangeTask,
  onSaveAndNextStep,
  selectedEvent,
  caseId = "unknown_case",
  selectedDetectVital,
  onChangeSelectedDetectVital,
  selectedWindow,
  anesthesiaStart,
  gasData = {},
  medBolusRows = [],
  medInfusionRows = [],
  fluidInRows = [],
  fluidOutRows = [],
}: TaskWorkspaceProps) {
  const [detectAnnotation, setDetectAnnotation] =
    React.useState<DetectAnnotation | null>(null);

  React.useEffect(() => {
    if (!selectedEvent && !selectedWindow && task !== "preventedEpisode") {
      setDetectAnnotation(null);
      return;
    }

    if (task === "preventedEpisode") {
      return;
    }

    setDetectAnnotation((prev) =>
      buildDefaultDetectAnnotation({
        selectedWindow,
        selectedEvent,
        selectedDetectVital,
        prev,
      })
    );
  }, [selectedEvent, selectedWindow, selectedDetectVital, task]);

  const eventContext = React.useMemo(() => {
    if (!selectedEvent && !selectedWindow) return null;
    if (!detectAnnotation) return null;

    const eventId = selectedEvent?.id ?? "timeline-selection";

    const eventTitle = selectedWindow
      ? `${detectAnnotation.vital} Window`
      : selectedEvent?.title ?? `${detectAnnotation.vital} Window`;

    const episodeLabel = selectedWindow
      ? `Selected ${detectAnnotation.vital} ${detectAnnotation.startMin}-${detectAnnotation.endMin} min`
      : selectedEvent?.episodeLabel ?? "Selected Window";

    return {
      eventId,
      eventTitle,
      episodeLabel,
      startMin: detectAnnotation.startMin,
      endMin: detectAnnotation.endMin,
    };
  }, [selectedEvent, selectedWindow, detectAnnotation]);

  if (task === "preventedEpisode") {
    return (
      <PreventedEpisodePanel
        caseId={caseId}
        eventId="patient-prevented-episode"
        eventTitle="Prevented Episode"
        episodeLabel="Patient-level prevented episode"
        anesthesiaStart={anesthesiaStart}
        selectedVital={selectedDetectVital}
        onChangeSelectedVital={onChangeSelectedDetectVital}
        selectedWindow={selectedWindow}
        onSaveAndNextStep={() => onSaveAndNextStep("preventedEpisode")}
      />
    );
  }

  if (!eventContext || !detectAnnotation) {
    return (
      <div className="flex min-h-[560px] items-center justify-center p-6 text-sm text-gray-500">
        Please select an event.
      </div>
    );
  }

  if (task === "detect") {
    return (
      <DetectPanel
        eventId={eventContext.eventId}
        caseId={caseId}
        eventTitle={eventContext.eventTitle}
        episodeLabel={eventContext.episodeLabel}
        annotation={detectAnnotation}
        onChangeAnnotation={(value) => {
          setDetectAnnotation((prev) => {
            const fallback = buildDefaultDetectAnnotation({
              selectedWindow,
              selectedEvent,
              selectedDetectVital,
              prev,
            });

            return typeof value === "function" ? value(fallback) : value;
          });
        }}
        anesthesiaStart={anesthesiaStart}
        onSaveAndNextStep={() => onSaveAndNextStep("detect")}
      />
    );
  }

  if (task === "mechanism") {
    return (
      <MechanismPanel
        eventId={eventContext.eventId}
        caseId={caseId}
        eventTitle={eventContext.eventTitle}
        episodeLabel={eventContext.episodeLabel}
        startMin={eventContext.startMin}
        endMin={eventContext.endMin}
        eventType={
          detectAnnotation.eventType &&
          detectAnnotation.eventType !== "Others"
            ? (detectAnnotation.eventType as EventType)
            : undefined
        }
        annotatorName={undefined}
        onSaveAndNextStep={() => onSaveAndNextStep("mechanism")}
      />
    );
  }

  if (task === "fluidEval") {
    return (
      <FluidEvalPanel
        eventId={eventContext.eventId}
        caseId={caseId}
        eventTitle={eventContext.eventTitle}
        episodeLabel={eventContext.episodeLabel}
        startMin={eventContext.startMin}
        endMin={eventContext.endMin}
        medBolusRows={medBolusRows}
        medInfusionRows={medInfusionRows}
        fluidInRows={fluidInRows}
        fluidOutRows={fluidOutRows}
        gasData={gasData}
        onSaveAndNextStep={() => onSaveAndNextStep("fluidEval")}
      />
    );
  }

  return (
    <div className="flex min-h-[560px] items-center justify-center p-6 text-sm text-gray-500">
      Unsupported task: {String(task)}
    </div>
  );
}