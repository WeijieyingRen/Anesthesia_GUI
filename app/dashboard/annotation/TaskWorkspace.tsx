"use client";

import * as React from "react";
import type {
  DetectAnnotation,
  DetectVital,
  SidebarEventItem,
  WorkspaceTaskKey,
  EventType,
  EpisodeAnnotationState,
  DetectedEpisodeItem,
  AnnotationTaskKey,
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

  // 新增：episode workflow 状态（可选，便于兼容旧逻辑）
  episodeState?: EpisodeAnnotationState | null;
  onChangeEpisodeState?: (next: EpisodeAnnotationState) => void;
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

function isAnnotationTask(task: WorkspaceTaskKey): task is AnnotationTaskKey {
  return task === "detect" || task === "mechanism" || task === "fluidEval";
}
function buildDetectedEpisodeFromWindow(
  selectedWindow: SelectedWindow
): DetectedEpisodeItem {
  const id = `${selectedWindow.vital}-${selectedWindow.startMin}-${selectedWindow.endMin}`;

  return {
    id,
    label: `${selectedWindow.vital} ${selectedWindow.startMin}-${selectedWindow.endMin} min`,
    vital: selectedWindow.vital,
    startMin: selectedWindow.startMin,
    endMin: selectedWindow.endMin,
    y1: selectedWindow.y1,
    y2: selectedWindow.y2,
    selectedForAnnotation: false,
  };
}

function buildDetectedEpisodeFromEvent(
  selectedEvent: SidebarEventItem
): DetectedEpisodeItem {
  return {
    id: selectedEvent.id,
    label:
      selectedEvent.episodeLabel ||
      `${selectedEvent.vital} ${selectedEvent.startMin}-${selectedEvent.endMin} min`,
    vital: selectedEvent.vital,
    startMin: selectedEvent.startMin,
    endMin: selectedEvent.endMin,
    y1: selectedEvent.y1,
    y2: selectedEvent.y2,
    selectedForAnnotation: false,
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
  episodeState,
  onChangeEpisodeState,
}: TaskWorkspaceProps) {
  const [detectAnnotationMap, setDetectAnnotationMap] = React.useState<
    Record<string, DetectAnnotation>
  >({});

  const [completedTaskMap, setCompletedTaskMap] = React.useState<
    Record<string, Partial<Record<AnnotationTaskKey, boolean>>>
  >({});

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

  const currentDetectAnnotation = React.useMemo(() => {
    if (!activeDetectedEpisode) return null;

    return (
      detectAnnotationMap[activeDetectedEpisode.id] ??
      buildDefaultDetectAnnotation({
        selectedWindow: activeDetectedEpisode
          ? {
              vital: activeDetectedEpisode.vital,
              startMin: activeDetectedEpisode.startMin,
              endMin: activeDetectedEpisode.endMin,
              y1: 0,
              y2: 0,
            }
          : null,
        selectedEvent: null,
        selectedDetectVital: activeDetectedEpisode.vital,
        prev: null,
      })
    );
  }, [activeDetectedEpisode, detectAnnotationMap]);

  React.useEffect(() => {
    if (workflowEnabled) return;

    if (!selectedEvent && !selectedWindow && task !== "preventedEpisode") {
      return;
    }

    if (task === "preventedEpisode") {
      return;
    }

    const defaultId =
      selectedEvent?.id ??
      (selectedWindow
        ? `${selectedWindow.vital}-${selectedWindow.startMin}-${selectedWindow.endMin}`
        : null);

    if (!defaultId) return;

    setDetectAnnotationMap((prev) => {
      if (prev[defaultId]) return prev;
      return {
        ...prev,
        [defaultId]: buildDefaultDetectAnnotation({
          selectedWindow,
          selectedEvent,
          selectedDetectVital,
          prev: null,
        }),
      };
    });
  }, [workflowEnabled, selectedEvent, selectedWindow, selectedDetectVital, task]);

  const legacyEventContext = React.useMemo(() => {
    if (!selectedEvent && !selectedWindow) return null;

    const eventId =
      selectedEvent?.id ??
      (selectedWindow
        ? `${selectedWindow.vital}-${selectedWindow.startMin}-${selectedWindow.endMin}`
        : "timeline-selection");

    const fallbackAnnotation = detectAnnotationMap[eventId];

    const vital =
      selectedWindow?.vital ??
      selectedEvent?.vital ??
      fallbackAnnotation?.vital ??
      selectedDetectVital;

    const startMin =
      selectedWindow?.startMin ??
      selectedEvent?.startMin ??
      fallbackAnnotation?.startMin ??
      0;

    const endMin =
      selectedWindow?.endMin ??
      selectedEvent?.endMin ??
      fallbackAnnotation?.endMin ??
      0;

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
    };
  }, [selectedEvent, selectedWindow, detectAnnotationMap, selectedDetectVital]);

  const addCurrentSelectionToDetectedEpisodes = React.useCallback(() => {
    if (!workflowEnabled || !episodeState || !onChangeEpisodeState) return;

    let nextItem: DetectedEpisodeItem | null = null;

    if (selectedWindow) {
      nextItem = buildDetectedEpisodeFromWindow(selectedWindow);
    } else if (selectedEvent) {
      nextItem = buildDetectedEpisodeFromEvent(selectedEvent);
    }

    if (!nextItem) return;

    const exists = episodeState.detectedEpisodes.some((ep) => ep.id === nextItem!.id);
    if (exists) return;

    onChangeEpisodeState({
      ...episodeState,
      detectedEpisodes: [...episodeState.detectedEpisodes, nextItem],
    });
  }, [
    workflowEnabled,
    episodeState,
    onChangeEpisodeState,
    selectedWindow,
    selectedEvent,
  ]);

  const togglePrioritizedEpisode = React.useCallback(
    (episodeId: string) => {
      if (!workflowEnabled || !episodeState || !onChangeEpisodeState) return;

      const alreadySelected = episodeState.prioritizedEpisodeIds.includes(episodeId);

      let nextIds: string[];
      if (alreadySelected) {
        nextIds = episodeState.prioritizedEpisodeIds.filter((id) => id !== episodeId);
      } else {
        if (episodeState.prioritizedEpisodeIds.length >= 3) return;
        nextIds = [...episodeState.prioritizedEpisodeIds, episodeId];
      }

      onChangeEpisodeState({
        ...episodeState,
        prioritizedEpisodeIds: nextIds,
        detectedEpisodes: episodeState.detectedEpisodes.map((ep) => ({
          ...ep,
          selectedForAnnotation: nextIds.includes(ep.id),
        })),
      });
    },
    [workflowEnabled, episodeState, onChangeEpisodeState]
  );

  const goToPickTop3 = React.useCallback(() => {
    if (!workflowEnabled || !episodeState || !onChangeEpisodeState) return;
    onChangeEpisodeState({
      ...episodeState,
      stage: "pick_top3",
    });
  }, [workflowEnabled, episodeState, onChangeEpisodeState]);

  const startAnnotation = React.useCallback(() => {
    if (!workflowEnabled || !episodeState || !onChangeEpisodeState) return;
    if (episodeState.prioritizedEpisodeIds.length === 0) return;

    onChangeEpisodeState({
      ...episodeState,
      stage: "annotate",
      annotateStep: "detect",
      activeEpisodeId: episodeState.prioritizedEpisodeIds[0],
    });

    onChangeTask("detect");
  }, [workflowEnabled, episodeState, onChangeEpisodeState, onChangeTask]);

  const setActiveEpisode = React.useCallback(
    (episodeId: string) => {
      if (!workflowEnabled || !episodeState || !onChangeEpisodeState) return;
      onChangeEpisodeState({
        ...episodeState,
        activeEpisodeId: episodeId,
      });
      onChangeTask("detect");
    },
    [workflowEnabled, episodeState, onChangeEpisodeState, onChangeTask]
  );

  const advanceAnnotateWorkflow = React.useCallback(
    (currentTask: AnnotationTaskKey) => {
      if (!workflowEnabled || !episodeState || !onChangeEpisodeState || !activeDetectedEpisode) {
        onSaveAndNextStep(currentTask);
        return;
      }

      const activeId = activeDetectedEpisode.id;

      setCompletedTaskMap((prev) => ({
        ...prev,
        [activeId]: {
          ...prev[activeId],
          [currentTask]: true,
        },
      }));

      if (currentTask === "detect") {
        onChangeEpisodeState({
          ...episodeState,
          annotateStep: "mechanism",
        });
        onChangeTask("mechanism");
        return;
      }

      if (currentTask === "mechanism") {
        onChangeEpisodeState({
          ...episodeState,
          annotateStep: "fluidEval",
        });
        onChangeTask("fluidEval");
        return;
      }

      const currentIndex = episodeState.prioritizedEpisodeIds.findIndex(
        (id) => id === activeId
      );

      const nextEpisodeId =
        currentIndex >= 0
          ? episodeState.prioritizedEpisodeIds[currentIndex + 1] ?? null
          : null;

      if (nextEpisodeId) {
        onChangeEpisodeState({
          ...episodeState,
          annotateStep: "detect",
          activeEpisodeId: nextEpisodeId,
        });
        onChangeTask("detect");
        return;
      }

      onSaveAndNextStep("fluidEval");
    },
    [
      workflowEnabled,
      episodeState,
      onChangeEpisodeState,
      activeDetectedEpisode,
      onChangeTask,
      onSaveAndNextStep,
    ]
  );

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
    if (episodeState.stage === "select_all") {
      const currentSelectionLabel = selectedWindow
        ? `${selectedWindow.vital} ${selectedWindow.startMin}-${selectedWindow.endMin} min`
        : selectedEvent
          ? selectedEvent.episodeLabel
          : "No current selection";

      return (
        <div className="flex min-h-[560px] flex-col gap-4 p-4">
          <div className="rounded-xl border bg-white p-4">
            <div className="text-lg font-semibold text-gray-900">
              Task 1. Select all sustained abnormal physiology events
            </div>
            <div className="mt-2 text-sm text-gray-600">
              Use the right panel to inspect the timeline, then add each abnormal episode here.
            </div>

            <div className="mt-4 rounded-lg border bg-gray-50 p-3 text-sm">
              <div className="font-medium text-gray-800">Current selection</div>
              <div className="mt-1 text-gray-600">{currentSelectionLabel}</div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={addCurrentSelectionToDetectedEpisodes}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Add selected episode
              </button>

              <button
                type="button"
                onClick={goToPickTop3}
                disabled={episodeState.detectedEpisodes.length === 0}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save and go to Task 2
              </button>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <div className="text-sm font-semibold text-gray-900">
              Selected abnormal episodes ({episodeState.detectedEpisodes.length})
            </div>

            {episodeState.detectedEpisodes.length === 0 ? (
              <div className="mt-3 text-sm text-gray-500">
                No episode selected yet.
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {episodeState.detectedEpisodes.map((ep) => (
                  <div
                    key={ep.id}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                  >
                    <span>{ep.label}</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (!onChangeEpisodeState) return;
                        onChangeEpisodeState({
                          ...episodeState,
                          detectedEpisodes: episodeState.detectedEpisodes.filter(
                            (x) => x.id !== ep.id
                          ),
                          prioritizedEpisodeIds: episodeState.prioritizedEpisodeIds.filter(
                            (id) => id !== ep.id
                          ),
                          activeEpisodeId:
                            episodeState.activeEpisodeId === ep.id
                              ? null
                              : episodeState.activeEpisodeId,
                        });
                      }}
                      className="text-xs font-medium text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (episodeState.stage === "pick_top3") {
      return (
        <div className="flex min-h-[560px] flex-col gap-4 p-4">
          <div className="rounded-xl border bg-white p-4">
            <div className="text-lg font-semibold text-gray-900">
              Task 2. Select up to 3 episodes for detailed annotation
            </div>
            <div className="mt-2 text-sm text-gray-600">
              Choose the most important episodes you want to annotate in detail.
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <div className="text-sm font-semibold text-gray-900">
              Chosen: {episodeState.prioritizedEpisodeIds.length} / 3
            </div>

            <div className="mt-3 space-y-2">
              {episodeState.detectedEpisodes.map((ep) => {
                const checked = episodeState.prioritizedEpisodeIds.includes(ep.id);
                const disabled =
                  !checked && episodeState.prioritizedEpisodeIds.length >= 3;

                return (
                  <label
                    key={ep.id}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                      checked ? "border-blue-500 bg-blue-50" : "border-gray-200"
                    } ${disabled ? "opacity-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => togglePrioritizedEpisode(ep.id)}
                    />
                    <span>{ep.label}</span>
                  </label>
                );
              })}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!onChangeEpisodeState) return;
                  onChangeEpisodeState({
                    ...episodeState,
                    stage: "select_all",
                  });
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
              >
                Back
              </button>

              <button
                type="button"
                onClick={startAnnotation}
                disabled={episodeState.prioritizedEpisodeIds.length === 0}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save and start annotation
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (episodeState.stage === "annotate" && activeDetectedEpisode && currentDetectAnnotation) {
      const eventContext = {
        eventId: activeDetectedEpisode.id,
        eventTitle: `${activeDetectedEpisode.vital} Episode`,
        episodeLabel: activeDetectedEpisode.label,
        startMin: activeDetectedEpisode.startMin,
        endMin: activeDetectedEpisode.endMin,
      };

      return (
        <div className="flex min-h-[560px] flex-col">
          <div className="border-b bg-white px-4 py-3">
            <div className="text-sm font-semibold text-gray-900">
              Task 3. Detailed annotation
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {episodeState.prioritizedEpisodeIds.map((id, index) => {
                const ep = episodeState.detectedEpisodes.find((x) => x.id === id);
                if (!ep) return null;

                const isActive = id === episodeState.activeEpisodeId;
                const progress = completedTaskMap[id] ?? {};
                const doneCount = ["detect", "mechanism", "fluidEval"].filter(
                  (k) => progress[k as AnnotationTaskKey]
                ).length;

                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveEpisode(id)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm ${
                      isActive
                        ? "border-blue-600 bg-blue-50 text-blue-800"
                        : "border-gray-300 bg-white text-gray-700"
                    }`}
                  >
                    <div className="font-medium">
                      Episode {index + 1}
                    </div>
                    <div className="text-xs">{ep.label}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {doneCount}/3 done
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex gap-2 text-xs">
              {(["detect", "mechanism", "fluidEval"] as AnnotationTaskKey[]).map((step) => {
                const isCurrent = task === step;
                return (
                  <div
                    key={step}
                    className={`rounded-full px-3 py-1 ${
                      isCurrent
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {step}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex-1">
            {task === "detect" && (
              <DetectPanel
                eventId={eventContext.eventId}
                caseId={caseId}
                eventTitle={eventContext.eventTitle}
                episodeLabel={eventContext.episodeLabel}
                annotation={currentDetectAnnotation}
                onChangeAnnotation={(value) => {
                  setDetectAnnotationMap((prev) => {
                    const fallback = prev[activeDetectedEpisode.id] ?? currentDetectAnnotation;
                    const nextValue =
                      typeof value === "function" ? value(fallback) : value;

                    return {
                      ...prev,
                      [activeDetectedEpisode.id]: nextValue,
                    };
                  });
                }}
                anesthesiaStart={anesthesiaStart}
                onSaveAndNextStep={() => advanceAnnotateWorkflow("detect")}
              />
            )}

            {task === "mechanism" && (
              <MechanismPanel
                eventId={eventContext.eventId}
                caseId={caseId}
                eventTitle={eventContext.eventTitle}
                episodeLabel={eventContext.episodeLabel}
                startMin={eventContext.startMin}
                endMin={eventContext.endMin}
                eventType={
                  currentDetectAnnotation.eventType &&
                  currentDetectAnnotation.eventType !== "Others"
                    ? (currentDetectAnnotation.eventType as EventType)
                    : undefined
                }
                annotatorName={undefined}
                onSaveAndNextStep={() => advanceAnnotateWorkflow("mechanism")}
              />
            )}

            {task === "fluidEval" && (
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
                onSaveAndNextStep={() => advanceAnnotateWorkflow("fluidEval")}
              />
            )}
          </div>
        </div>
      );
    }
  }

  if (!legacyEventContext) {
    return (
      <div className="flex min-h-[560px] items-center justify-center p-6 text-sm text-gray-500">
        Please select an event.
      </div>
    );
  }

  const legacyDetectAnnotation =
    detectAnnotationMap[legacyEventContext.eventId] ??
    buildDefaultDetectAnnotation({
      selectedWindow,
      selectedEvent,
      selectedDetectVital,
      prev: null,
    });

  if (task === "detect") {
    return (
      <DetectPanel
        eventId={legacyEventContext.eventId}
        caseId={caseId}
        eventTitle={legacyEventContext.eventTitle}
        episodeLabel={legacyEventContext.episodeLabel}
        annotation={legacyDetectAnnotation}
        onChangeAnnotation={(value) => {
          setDetectAnnotationMap((prev) => {
            const fallback =
              prev[legacyEventContext.eventId] ?? legacyDetectAnnotation;

            const nextValue =
              typeof value === "function" ? value(fallback) : value;

            return {
              ...prev,
              [legacyEventContext.eventId]: nextValue,
            };
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
        eventId={legacyEventContext.eventId}
        caseId={caseId}
        eventTitle={legacyEventContext.eventTitle}
        episodeLabel={legacyEventContext.episodeLabel}
        startMin={legacyEventContext.startMin}
        endMin={legacyEventContext.endMin}
        eventType={
          legacyDetectAnnotation.eventType &&
          legacyDetectAnnotation.eventType !== "Others"
            ? (legacyDetectAnnotation.eventType as EventType)
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
        eventId={legacyEventContext.eventId}
        caseId={caseId}
        eventTitle={legacyEventContext.eventTitle}
        episodeLabel={legacyEventContext.episodeLabel}
        startMin={legacyEventContext.startMin}
        endMin={legacyEventContext.endMin}
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