"use client";

import * as React from "react";
import ResponsePanel from "./panels/ResponsePanel";
import type {
  AnnotationTaskKey,
  SidebarEventItem,
  DetectAnnotation,
} from "./types";
import type { TimeValuePoint } from "@/lib/types";
import DetectPanel from "./panels/DetectPanel";
import MechanismPanel from "./panels/MechanismPanel";
import FluidEvalPanel from "./panels/FluidEvalPanel";
import PreventionPanel from "./panels/PreventionPanel";

type DetectVital = "MAP" | "HR" | "SPO2" | "RR" | "ETCO2" | "TEMP";

type SelectedWindow = {
  vital: DetectVital;
  startMin: number;
  endMin: number;
  y1: number;
  y2: number;
};

type TaskWorkspaceProps = {
  task: AnnotationTaskKey;
  onChangeTask: (task: AnnotationTaskKey) => void;
  onSaveAndNextStep: (task: AnnotationTaskKey) => void;
  selectedEvent: SidebarEventItem | null;
  caseId?: string;
  selectedDetectVital: DetectVital;
  selectedWindow: SelectedWindow | null;
  anesthesiaStart?: string | null;
  medications?: any;
  gasData?: Record<string, TimeValuePoint[] | undefined>;
  medBolusRows?: any[];
  medInfusionRows?: any[];
  fluidInRows?: any[];
  fluidOutRows?: any[];
};

export default function TaskWorkspace({
  task,
  onChangeTask,
  onSaveAndNextStep,
  selectedEvent,
  caseId = "unknown_case",
  selectedDetectVital,
  selectedWindow,
  anesthesiaStart,
  medications,
  gasData = {},
  medBolusRows = [],
  medInfusionRows = [],
  fluidInRows = [],
  fluidOutRows = [],
}: TaskWorkspaceProps) {
  const [detectAnnotation, setDetectAnnotation] =
    React.useState<DetectAnnotation | null>(null);

  React.useEffect(() => {
    if (!selectedEvent && !selectedWindow) {
      setDetectAnnotation(null);
      return;
    }

    const vital = selectedWindow?.vital ?? selectedDetectVital;
    const startMin = selectedWindow?.startMin ?? selectedEvent?.startMin ?? 0;
    const endMin = selectedWindow?.endMin ?? selectedEvent?.endMin ?? 0;

    setDetectAnnotation((prev) => ({
      ...(prev ?? {}),
      vital,
      startMin,
      endMin,
      eventType: prev?.eventType ?? "",
      severity: prev?.severity ?? "",
      confidence: prev?.confidence ?? null,
      note: prev?.note ?? "",
      episodeEvolution: (prev as any)?.episodeEvolution ?? "",
      episodeEvolutionNote: (prev as any)?.episodeEvolutionNote ?? "",
      overallCharacterization: (prev as any)?.overallCharacterization ?? "",
      overallInterpretationNote: (prev as any)?.overallInterpretationNote ?? "",
      eventTypeOther: prev?.eventTypeOther ?? "",
    }) as DetectAnnotation);
  }, [selectedEvent, selectedWindow, selectedDetectVital]);

  if (!selectedEvent && !selectedWindow) {
    return (
      <div className="flex min-h-[560px] items-center justify-center p-6 text-sm text-gray-500">
        Please select an event.
      </div>
    );
  }

  if (!detectAnnotation) {
    return (
      <div className="flex min-h-[560px] items-center justify-center p-6 text-sm text-gray-500">
        Please select an event.
      </div>
    );
  }

  const effectiveEventId = selectedEvent?.id ?? "timeline-selection";

  const effectiveEventTitle = selectedWindow
    ? `${detectAnnotation.vital} Window`
    : selectedEvent?.title ?? `${detectAnnotation.vital} Window`;

  const effectiveEpisodeLabel = selectedWindow
    ? `Selected ${detectAnnotation.vital} ${detectAnnotation.startMin}-${detectAnnotation.endMin} min`
    : selectedEvent?.episodeLabel ?? "Selected Window";

  if (task === "detect") {
    return (
      <DetectPanel
        eventId={effectiveEventId}
        caseId={caseId}
        eventTitle={effectiveEventTitle}
        episodeLabel={effectiveEpisodeLabel}
        annotation={detectAnnotation}
        onChangeAnnotation={(value) => {
          setDetectAnnotation((prev) => {
            const fallback: DetectAnnotation = {
              ...(prev ?? {}),
              vital: selectedWindow?.vital ?? selectedDetectVital,
              startMin: selectedWindow?.startMin ?? selectedEvent?.startMin ?? 0,
              endMin: selectedWindow?.endMin ?? selectedEvent?.endMin ?? 0,
              eventType: prev?.eventType ?? "",
              eventTypeOther: prev?.eventTypeOther ?? "",
              note: (prev as any)?.note ?? "",
              episodeEvolution: (prev as any)?.episodeEvolution ?? "",
              episodeEvolutionNote: (prev as any)?.episodeEvolutionNote ?? "",
              overallCharacterization:
                (prev as any)?.overallCharacterization ?? "",
              overallInterpretationNote:
                (prev as any)?.overallInterpretationNote ?? "",
              severity: prev?.severity ?? "",
              confidence: prev?.confidence ?? null,
            } as DetectAnnotation;

            return typeof value === "function" ? value(fallback) : value;
          });
        }}
        anesthesiaStart={anesthesiaStart}
        onSaveAndNextStep={() => onSaveAndNextStep("detect")}
      />
    );
  }

  if (task === "prevention") {
    return (
      <PreventionPanel
        eventId={effectiveEventId}
        caseId={caseId}
        eventTitle={effectiveEventTitle}
        episodeLabel={effectiveEpisodeLabel}
        startMin={detectAnnotation.startMin}
        endMin={detectAnnotation.endMin}
        onSaveAndNextStep={() => onSaveAndNextStep("prevention")}
      />
    );
  }

  if (task === "mechanism") {
    return (
      <MechanismPanel
        eventId={effectiveEventId}
        caseId={caseId}
        eventTitle={effectiveEventTitle}
        episodeLabel={effectiveEpisodeLabel}
        startMin={detectAnnotation.startMin}
        endMin={detectAnnotation.endMin}
        eventType={detectAnnotation.eventType as any}
        onSaveAndNextStep={() => onSaveAndNextStep("mechanism")}
      />
    );
  }

  if (task === "fluidEval") {
    return (
      <FluidEvalPanel
        eventId={effectiveEventId}
        caseId={caseId}
        eventTitle={effectiveEventTitle}
        episodeLabel={effectiveEpisodeLabel}
        startMin={detectAnnotation.startMin}
        endMin={detectAnnotation.endMin}
        medBolusRows={medBolusRows}
        medInfusionRows={medInfusionRows}
        fluidInRows={fluidInRows}
        fluidOutRows={fluidOutRows}
        gasData={gasData}
        onSaveAndNextStep={() => onSaveAndNextStep("fluidEval")}
      />
    );
  }

  if (task === "response") {
    return (
      <ResponsePanel
        eventId={effectiveEventId}
        caseId={caseId}
        eventTitle={effectiveEventTitle}
        episodeLabel={effectiveEpisodeLabel}
        startMin={detectAnnotation.startMin}
        endMin={detectAnnotation.endMin}
        onSaveAndNextStep={() => onSaveAndNextStep("response")}
      />
    );
  }

  return (
    <div className="flex min-h-[560px] items-center justify-center p-6 text-sm text-gray-500">
      Unsupported task.
    </div>
  );
}