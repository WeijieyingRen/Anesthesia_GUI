"use client";

import type {
  EpisodeAnnotationState,
  SidebarEventItem,
} from "./types";

type AnnotationSidebarProps = {
  events: SidebarEventItem[]; // 保留，兼容旧调用；新逻辑里可不用
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
  onDeleteEvent: (eventId: string) => void;

  // 新增：episode workflow
  episodeState?: EpisodeAnnotationState | null;
  onSelectWorkflowStage?: (
    stage: "select_all" | "pick_top3" | "annotate"
  ) => void;
};

function StepBadge({
  index,
  active,
  done,
}: {
  index: number;
  active: boolean;
  done: boolean;
}) {
  return (
    <div
      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
        active
          ? "bg-blue-600 text-white"
          : done
          ? "bg-green-600 text-white"
          : "bg-gray-200 text-gray-600"
      }`}
    >
      {done && !active ? "✓" : index}
    </div>
  );
}

export default function AnnotationSidebar({
  events,
  selectedEventId,
  onSelectEvent,
  onDeleteEvent,
  episodeState,
  onSelectWorkflowStage,
}: AnnotationSidebarProps) {
  const workflowEnabled = !!episodeState;

  if (workflowEnabled && episodeState) {
    const step1Done = episodeState.detectedEpisodes.length > 0;
    const step2Done = episodeState.prioritizedEpisodeIds.length > 0;
    const currentStage = episodeState.stage;

    const prioritizedEpisodes = episodeState.prioritizedEpisodeIds
      .map((id) => episodeState.detectedEpisodes.find((ep) => ep.id === id))
      .filter(Boolean);

    return (
      <div className="p-4">
        <div className="mb-4">
          <h3 className="text-base font-bold text-gray-800">Episode workflow</h3>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => onSelectWorkflowStage?.("select_all")}
            className={`w-full rounded-xl border px-3 py-3 text-left transition ${
              currentStage === "select_all"
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 bg-white hover:bg-gray-50"
            }`}
          >
            <div className="flex items-start gap-3">
              <StepBadge
                index={1}
                active={currentStage === "select_all"}
                done={step1Done}
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-800">
                  Select all abnormalities
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {episodeState.detectedEpisodes.length} selected
                </div>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              if (!step1Done) return;
              onSelectWorkflowStage?.("pick_top3");
            }}
            disabled={!step1Done}
            className={`w-full rounded-xl border px-3 py-3 text-left transition ${
              currentStage === "pick_top3"
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 bg-white hover:bg-gray-50"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <div className="flex items-start gap-3">
              <StepBadge
                index={2}
                active={currentStage === "pick_top3"}
                done={step2Done}
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-800">
                  Pick up to 3
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {episodeState.prioritizedEpisodeIds.length}/3 chosen
                </div>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              if (!step2Done) return;
              onSelectWorkflowStage?.("annotate");
            }}
            disabled={!step2Done}
            className={`w-full rounded-xl border px-3 py-3 text-left transition ${
              currentStage === "annotate"
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 bg-white hover:bg-gray-50"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <div className="flex items-start gap-3">
              <StepBadge
                index={3}
                active={currentStage === "annotate"}
                done={false}
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-800">
                  Annotate selected episodes
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  Detection → Mechanism → Intervention
                </div>
              </div>
            </div>
          </button>
        </div>

        {currentStage === "annotate" && prioritizedEpisodes.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Selected episodes
            </div>

            <div className="space-y-2">
              {prioritizedEpisodes.map((ep, index) => {
                if (!ep) return null;
                const active = ep.id === episodeState.activeEpisodeId;

                return (
                  <button
                    key={ep.id}
                    type="button"
                    onClick={() => onSelectEvent(ep.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                      active
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 bg-white hover:bg-gray-50"
                    }`}
                  >
                    <div className="text-xs font-medium text-gray-500">
                      Episode {index + 1}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-gray-800">
                      {ep.label}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 旧逻辑保留，兼容 patient-level 或旧页面
  return (
    <div className="w-full max-w-[200px] p-4">
      <div className="mb-4">
        <h3 className="text-base font-bold text-gray-800">Checklist</h3>
      </div>

      <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
        {events.map((event) => {
          const active = event.id === selectedEventId;

          return (
            <div
              key={event.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectEvent(event.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectEvent(event.id);
                }
              }}
              className={`w-full cursor-pointer rounded-xl border px-2.5 py-1.5 text-left transition ${
                active
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-gray-800">
                    {event.title}
                  </div>

                  <div className="mt-1 text-xs font-medium text-gray-600">
                    {event.episodeLabel}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteEvent(event.id);
                  }}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"
                  title="Delete event"
                  aria-label={`Delete ${event.title}`}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}

        {events.length === 0 && (
          <div className="rounded-xl border border-dashed p-4 text-sm text-gray-500">
            No events yet.
          </div>
        )}
      </div>
    </div>
  );
}