"use client";

import * as React from "react";
import type {
  DetectVital,
  SidebarEventItem,
  WorkspaceTaskKey,
  EpisodeAnnotationState,
  AnnotationTaskKey,
} from "./types";
import type { TimeValuePoint } from "@/lib/types";
import PreventedEpisodePanel from "./panels/PreventedEpisodePanel";
import Episode3TextPanel from "./panels/Episode3TextPanel";

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
  onSaveAndNextStep: (task: AnnotationTaskKey | WorkspaceTaskKey) => void;

  selectedEvent: SidebarEventItem | null;

  caseId?: string;
  patientId?: string;
  patientFolder?: string;
  episodeNumber?: number;

  selectedDetectVital: DetectVital;
  onChangeSelectedDetectVital: (vital: DetectVital) => void;
  selectedWindow: SelectedWindow | null;
  onChangeSelectedWindow?: (window: SelectedWindow | null) => void;
  anesthesiaStart?: string | null;

  gasData?: Record<string, TimeValuePoint[] | undefined>;
  medBolusRows?: any[];
  medInfusionRows?: any[];
  fluidInRows?: any[];
  fluidOutRows?: any[];

  episodeState?: EpisodeAnnotationState | null;
  onChangeEpisodeState?: (next: EpisodeAnnotationState) => void;

  completedTaskMap: Record<string, Partial<Record<AnnotationTaskKey, boolean>>>;
  onChangeCompletedTaskMap: React.Dispatch<
    React.SetStateAction<Record<string, Partial<Record<AnnotationTaskKey, boolean>>>>
  >;
};

function isAnnotationTask(task: WorkspaceTaskKey): task is AnnotationTaskKey {
  return task === "detect" || task === "mechanism" || task === "fluidEval";
}

export default function TaskWorkspace({
  task,
  onChangeTask,
  onSaveAndNextStep,
  selectedEvent,
  caseId = "unknown_case",
  patientId,
  patientFolder,
  episodeNumber,
  selectedDetectVital,
  onChangeSelectedDetectVital,
  selectedWindow,
  onChangeSelectedWindow,
  anesthesiaStart,
  episodeState,
  onChangeEpisodeState,
  completedTaskMap,
}: TaskWorkspaceProps) {
  const workflowEnabled =
    !!episodeState && !!onChangeEpisodeState && isAnnotationTask(task);

  const activeDetectedEpisode = React.useMemo(() => {
    if (!workflowEnabled || !episodeState?.activeEpisodeId) return null;

    return (
      episodeState.detectedEpisodes.find(
        (ep) => ep.id === episodeState.activeEpisodeId
      ) ?? null
    );
  }, [workflowEnabled, episodeState]);

  const setActiveEpisode = React.useCallback(
    (episodeId: string) => {
      if (!workflowEnabled || !episodeState || !onChangeEpisodeState) return;

      const nextEpisode =
        episodeState.detectedEpisodes.find((episode) => episode.id === episodeId) ??
        null;

      onChangeEpisodeState({
        ...episodeState,
        activeEpisodeId: episodeId,
        annotateStep: "detect",
      });

      if (nextEpisode) {
        onChangeSelectedDetectVital(nextEpisode.vital);
        onChangeSelectedWindow?.({
          vital: nextEpisode.vital,
          startMin: nextEpisode.startMin,
          endMin: nextEpisode.endMin,
          y1: nextEpisode.y1,
          y2: nextEpisode.y2,
        });
      }

      onChangeTask("detect");
    },
    [
      workflowEnabled,
      episodeState,
      onChangeEpisodeState,
      onChangeSelectedDetectVital,
      onChangeSelectedWindow,
      onChangeTask,
    ]
  );

  const handleBackToPreviousSection = React.useCallback(() => {
    if (!workflowEnabled || !episodeState || !onChangeEpisodeState) return;

    onChangeEpisodeState({
      ...episodeState,
      stage: "pick_top3",
      activeEpisodeId: null,
      annotateStep: "detect",
    });

    onChangeTask("detect");
  }, [workflowEnabled, episodeState, onChangeEpisodeState, onChangeTask]);

  const legacyEventContext = React.useMemo(() => {
    if (!selectedEvent && !selectedWindow) return null;

    const eventId =
      selectedEvent?.id ??
      (selectedWindow
        ? `${selectedWindow.vital}-${selectedWindow.startMin}-${selectedWindow.endMin}`
        : "timeline-selection");

    const vital = selectedWindow?.vital ?? selectedEvent?.vital ?? selectedDetectVital;

    const startMin = selectedWindow?.startMin ?? selectedEvent?.startMin ?? 0;
    const endMin = selectedWindow?.endMin ?? selectedEvent?.endMin ?? 0;

    const eventTitle = selectedWindow
      ? `${vital} Window`
      : selectedEvent?.title ?? `${vital} Window`;

    const episodeLabel = selectedWindow
      ? `Selected ${vital} ${startMin}-${endMin} min`
      : selectedEvent?.episodeLabel ?? "Selected Window";

    return {
      eventId,
      eventTitle,
      episodeLabel,
      vital,
      startMin,
      endMin,
      y1: selectedWindow?.y1 ?? selectedEvent?.y1 ?? 0,
      y2: selectedWindow?.y2 ?? selectedEvent?.y2 ?? 0,
    };
  }, [selectedEvent, selectedWindow, selectedDetectVital]);

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

  if (workflowEnabled && episodeState) {
    if (episodeState.stage === "annotate" && activeDetectedEpisode) {
      const mergedSelectedEvent: SidebarEventItem = {
        id: activeDetectedEpisode.id,
        vital: activeDetectedEpisode.vital,
        title: `${activeDetectedEpisode.vital} Episode`,
        episodeLabel: activeDetectedEpisode.label,
        startMin: activeDetectedEpisode.startMin,
        endMin: activeDetectedEpisode.endMin,
        y1: activeDetectedEpisode.y1,
        y2: activeDetectedEpisode.y2,
        completed: {
          detect: completedTaskMap[activeDetectedEpisode.id]?.detect ?? false,
          mechanism: false,
          fluidEval: false,
        },
      };

      const episodeList = episodeState.prioritizedEpisodeIds
        .map((id) => episodeState.detectedEpisodes.find((x) => x.id === id))
        .filter(Boolean)
        .map((ep) => ({
          id: ep!.id,
          label: ep!.label,
          vital: ep!.vital,
          startMin: ep!.startMin,
          endMin: ep!.endMin,
          y1: ep!.y1,
          y2: ep!.y2,
          createdAtUtc: ep!.createdAtUtc,
          updatedAtUtc: ep!.updatedAtUtc,
        }));

      return (
        <div className="flex min-h-[560px] flex-col bg-white">
          <div className="flex-1 p-4">
            <Episode3TextPanel
              caseId={caseId}
              selectedEvent={mergedSelectedEvent}
              patientId={patientId}
              patientFolder={patientFolder}
              episodeNumber={episodeNumber}
              anesthesiaStart={anesthesiaStart}
              onSaveAndNextStep={() => onSaveAndNextStep("detect")}
              onBackToEpisodeSelection={handleBackToPreviousSection}
              episodeList={episodeList}
              activeEpisodeId={episodeState.activeEpisodeId}
              completedMap={completedTaskMap}
              onSelectEpisode={setActiveEpisode}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-[560px] items-center justify-center p-6 text-sm text-gray-500">
        Please select one prioritized episode.
      </div>
    );
  }

  if (!legacyEventContext) {
    return (
      <div className="flex min-h-[560px] items-center justify-center p-6 text-sm text-gray-500">
        Please select an event.
      </div>
    );
  }

  const legacySelectedEvent: SidebarEventItem = {
    id: legacyEventContext.eventId,
    vital: legacyEventContext.vital,
    title: legacyEventContext.eventTitle,
    episodeLabel: legacyEventContext.episodeLabel,
    startMin: legacyEventContext.startMin,
    endMin: legacyEventContext.endMin,
    y1: legacyEventContext.y1,
    y2: legacyEventContext.y2,
    completed: {
      detect: false,
      mechanism: false,
      fluidEval: false,
    },
  };

  if (task === "detect") {
    return (
      <Episode3TextPanel
        caseId={caseId}
        selectedEvent={legacySelectedEvent}
        patientId={patientId}
        patientFolder={patientFolder}
        episodeNumber={episodeNumber}
        anesthesiaStart={anesthesiaStart}
        onSaveAndNextStep={() => onSaveAndNextStep("detect")}
      />
    );
  }

  return (
    <div className="flex min-h-[560px] items-center justify-center p-6 text-sm text-gray-500">
      Unsupported task: {String(task)}
    </div>
  );
}
