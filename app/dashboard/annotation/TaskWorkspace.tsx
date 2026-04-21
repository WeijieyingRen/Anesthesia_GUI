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
  onSaveAndNextStep: (task: AnnotationTaskKey | WorkspaceTaskKey) => void;
  selectedEvent: SidebarEventItem | null;
  caseId?: string;
  patientId?: string;
  patientFolder?: string;
  episodeNumber?: number;
  selectedDetectVital: DetectVital;
  onChangeSelectedDetectVital: (vital: DetectVital) => void;
  selectedWindow: SelectedWindow | null;
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
    React.SetStateAction<
      Record<string, Partial<Record<AnnotationTaskKey, boolean>>>
    >
  >;
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

function StepProgressBoxes({
  progress,
}: {
  progress: Partial<Record<AnnotationTaskKey, boolean>>;
}) {
  const steps: AnnotationTaskKey[] = ["detect", "mechanism", "fluidEval"];
  const doneCount = steps.filter((k) => progress[k]).length;

  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        {steps.map((step) => {
          const done = !!progress[step];
          return (
            <div
              key={step}
              className={`flex h-5 w-5 items-center justify-center rounded border text-[11px] font-bold ${
                done
                  ? "border-green-600 bg-green-600 text-white"
                  : "border-gray-300 bg-white text-transparent"
              }`}
            >
              ✓
            </div>
          );
        })}
      </div>
      <span className="text-xs text-gray-500">{doneCount}/3</span>
    </div>
  );
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
  anesthesiaStart,
  gasData = {},
  medBolusRows = [],
  medInfusionRows = [],
  fluidInRows = [],
  fluidOutRows = [],
  episodeState,
  onChangeEpisodeState,
  completedTaskMap,
  onChangeCompletedTaskMap,
}: TaskWorkspaceProps) {
  const [detectAnnotationMap, setDetectAnnotationMap] = React.useState<
    Record<string, DetectAnnotation>
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
              y1: activeDetectedEpisode.y1,
              y2: activeDetectedEpisode.y2,
            }
          : null,
        selectedEvent: null,
        selectedDetectVital: activeDetectedEpisode.vital,
        prev: null,
      })
    );
  }, [activeDetectedEpisode, detectAnnotationMap, selectedDetectVital]);

  React.useEffect(() => {
    if (workflowEnabled) return;
    if (!selectedEvent && !selectedWindow && task !== "preventedEpisode") return;
    if (task === "preventedEpisode") return;

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

  React.useEffect(() => {
    if (!workflowEnabled) return;
    if (!activeDetectedEpisode) return;
    if (!selectedWindow) return;
    if (selectedWindow.vital !== activeDetectedEpisode.vital) return;

    setDetectAnnotationMap((prev) => {
      const prevAnno =
        prev[activeDetectedEpisode.id] ??
        buildDefaultDetectAnnotation({
          selectedWindow,
          selectedEvent: null,
          selectedDetectVital: activeDetectedEpisode.vital,
          prev: null,
        });

      return {
        ...prev,
        [activeDetectedEpisode.id]: {
          ...prevAnno,
          vital: selectedWindow.vital,
          startMin: selectedWindow.startMin,
          endMin: selectedWindow.endMin,
        },
      };
    });
  }, [workflowEnabled, activeDetectedEpisode, selectedWindow, selectedDetectVital]);

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

      const progress = completedTaskMap[episodeId] ?? {};
      if (!progress.detect) {
        onChangeTask("detect");
      } else if (!progress.mechanism) {
        onChangeTask("mechanism");
      } else if (!progress.fluidEval) {
        onChangeTask("fluidEval");
      } else {
        onChangeTask("fluidEval");
      }
    },
    [workflowEnabled, episodeState, onChangeEpisodeState, onChangeTask, completedTaskMap]
  );

  const handleBackToPreviousSection = React.useCallback(() => {
    if (!workflowEnabled || !episodeState || !onChangeEpisodeState) return;

    if (task === "fluidEval") {
      onChangeEpisodeState({
        ...episodeState,
        annotateStep: "mechanism",
      });
      onChangeTask("mechanism");
      return;
    }

    if (task === "mechanism") {
      onChangeEpisodeState({
        ...episodeState,
        annotateStep: "detect",
      });
      onChangeTask("detect");
      return;
    }

    onChangeEpisodeState({
      ...episodeState,
      stage: "pick_top3",
      activeEpisodeId: null,
    });
    onChangeTask("detect");
  }, [workflowEnabled, episodeState, onChangeEpisodeState, task, onChangeTask]);

  const advanceAnnotateWorkflow = React.useCallback(
    (currentTask: AnnotationTaskKey) => {
      if (!workflowEnabled || !episodeState || !onChangeEpisodeState || !activeDetectedEpisode) {
        onSaveAndNextStep(currentTask);
        return;
      }

      const activeId = activeDetectedEpisode.id;

      if (
        currentTask === "detect" &&
        currentDetectAnnotation?.shouldContinueAnnotation === "Yes, likely artifact"
      ) {
        onChangeCompletedTaskMap((prev) => ({
          ...prev,
          [activeId]: {
            detect: true,
            mechanism: true,
            fluidEval: true,
          },
        }));

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
        return;
      }

      onChangeCompletedTaskMap((prev) => ({
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
      currentDetectAnnotation,
      onChangeTask,
      onSaveAndNextStep,
      onChangeCompletedTaskMap,
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
              Task 1. Select 3 most important dynamic physiology events
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
        <div className="flex min-h-[560px] flex-col bg-white">
          <div className="bg-white px-4 py-4">
            <button
              type="button"
              onClick={handleBackToPreviousSection}
              className="
                relative inline-flex items-center
                rounded-r-md
                bg-orange-200 text-orange-900
                px-5 py-2.5 pl-6
                text-sm font-medium
                hover:bg-orange-300
                before:absolute before:left-[-16px] before:top-0
                before:h-0 before:w-0
                before:border-y-[22px] before:border-y-transparent
                before:border-r-[16px] before:border-r-orange-200
                hover:before:border-r-orange-300
              "
            >
              Back to Abnormality Selection Section
            </button>

            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                    1
                  </span>
                  <h4 className="text-sm font-semibold text-blue-900">
                    Annotation Instruction
                  </h4>
                </div>

                <ol className="list-decimal space-y-1 pl-5 text-sm leading-6 text-blue-900">
                  <li>Annotate all selected abnormal episodes.</li>
                  <li>For each episode, complete Detection, Mechanism, and Intervention.</li>
                  <li>You can switch between episodes at any time if needed.</li>
                  <li>Remember to save when you finish each episode annotation.</li>
                </ol>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-4">
              {episodeState.prioritizedEpisodeIds.map((id, index) => {
                const ep = episodeState.detectedEpisodes.find((x) => x.id === id);
                if (!ep) return null;

                const isActive = id === episodeState.activeEpisodeId;
                const progress = completedTaskMap[id] ?? {};

                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveEpisode(id)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition ${
                      isActive
                        ? "border-blue-600 bg-blue-50 text-blue-800"
                        : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <div className="text-base font-semibold leading-none">
                      Episode {index + 1}
                    </div>
                    <div className="mt-1.5 text-sm leading-none">{ep.label}</div>
                    <StepProgressBoxes progress={progress} />
                  </button>
                );
              })}
            </div>

            <div className="mt-5 border-t border-gray-200 pt-4">
              <div className="flex flex-wrap gap-3">
                {(
                  [
                    { key: "detect", label: "Detection" },
                    { key: "mechanism", label: "Mechanism" },
                    { key: "fluidEval", label: "Intervention" },
                  ] as const
                ).map((step) => {
                  const isCurrent = task === step.key;

                  return (
                    <button
                      key={step.key}
                      type="button"
                      onClick={() => onChangeTask(step.key)}
                      className={`rounded-full px-5 py-2 text-lg font-medium transition ${
                        isCurrent
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {step.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex-1">
            {task === "detect" && (
             <DetectPanel
             eventId={eventContext.eventId}
             caseId={caseId}
             patientId={patientId}
             patientFolder={patientFolder}
             episodeNumber={episodeNumber}
             eventTitle={eventContext.eventTitle}
             episodeLabel={eventContext.episodeLabel}
                annotation={currentDetectAnnotation}
                onChangeAnnotation={(value) => {
                  setDetectAnnotationMap((prev) => {
                    const fallback =
                      prev[activeDetectedEpisode.id] ?? currentDetectAnnotation;
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
            patientId={patientId}
            patientFolder={patientFolder}
            episodeNumber={episodeNumber}
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
            patientId={patientId}
            patientFolder={patientFolder}
            episodeNumber={episodeNumber}
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
    
      patientId={patientId}
    
      patientFolder={patientFolder}
    
      episodeNumber={episodeNumber}
    
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
    
      patientId={patientId}
    
      patientFolder={patientFolder}
    
      episodeNumber={episodeNumber}
    
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
    
      patientId={patientId}
    
      patientFolder={patientFolder}
    
      episodeNumber={episodeNumber}
    
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