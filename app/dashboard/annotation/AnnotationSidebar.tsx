"use client";

import type { AnnotationTaskKey, SidebarEventItem } from "./types";

type AnnotationSidebarProps = {
  selectedTask: AnnotationTaskKey;
  onChangeTask: (task: AnnotationTaskKey) => void;
  events: SidebarEventItem[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
};

const TASK_ORDER: AnnotationTaskKey[] = [
  "detect",
  "mechanism",
  "gasEval",
  "medEval",
  "response",
  "summary",
];

export default function AnnotationSidebar({
  events,
  selectedEventId,
  onSelectEvent,
}: AnnotationSidebarProps) {
  return (
    <div className="p-4">
      <div className="mb-4">
        <h3 className="text-base font-bold text-gray-800">Checklist</h3>
      </div>

      <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
        {events.map((event) => {
          const active = event.id === selectedEventId;
          const doneTasks = TASK_ORDER.filter((task) => event.completed[task]).length;
          const hasAnyCompleted = doneTasks > 0;

          return (
            <button
              key={event.id}
              type="button"
              onClick={() => onSelectEvent(event.id)}
              className={`w-full rounded-xl border px-2.5 py-1.5 text-left transition ${
                hasAnyCompleted
                  ? active
                    ? "border-gray-400 bg-gray-200"
                    : "border-gray-300 bg-gray-100 hover:bg-gray-200"
                  : active
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 truncate text-sm font-semibold text-gray-800">
                  {event.title}
                </div>

                <div className="shrink-0 text-xs font-medium text-gray-600">
                  {doneTasks}/{TASK_ORDER.length}
                </div>
              </div>

              <div className="mt-1.5 flex items-center gap-1">
                {TASK_ORDER.map((task) => {
                  const completed = event.completed[task];

                  return (
                    <div
                      key={task}
                      className={`flex h-4 w-4 items-center justify-center rounded-[3px] border text-[10px] font-bold ${
                        completed
                          ? "border-green-500 bg-green-500 text-white"
                          : "border-gray-300 bg-white text-transparent"
                      }`}
                    >
                      ✓
                    </div>
                  );
                })}
              </div>
            </button>
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