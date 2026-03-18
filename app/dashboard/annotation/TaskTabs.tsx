"use client";

import type { AnnotationTaskKey } from "./types";

type TaskTabsProps = {
  selectedTask: AnnotationTaskKey;
  onChangeTask: (task: AnnotationTaskKey) => void;
};

const TASKS: Array<{ key: AnnotationTaskKey; label: string }> = [
  { key: "detect", label: "Detect" },
  { key: "mechanism", label: "Mechanism" },
  { key: "gasEval", label: "Gas Eval" },
  { key: "medEval", label: "Med Eval" },
  { key: "fluidEval", label: "Fluid Eval" },
  { key: "response", label: "Response" },
];

export default function TaskTabs({
  selectedTask,
  onChangeTask,
}: TaskTabsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {TASKS.map((task) => {
        const active = selectedTask === task.key;
        return (
          <button
            key={task.key}
            type="button"
            onClick={() => onChangeTask(task.key)}
            className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
              active
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {task.label}
          </button>
        );
      })}
    </div>
  );
}