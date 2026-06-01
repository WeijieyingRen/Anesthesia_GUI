"use client";

import * as React from "react";

type TimelineDragBarProps = {
  value: number;
  max: number;
  ariaLabel?: string;
  caption?: string;
  onChange: (value: number) => void;
};

export function TimelineDragBar({
  value,
  max,
  ariaLabel = "Horizontal scroll",
  onChange,
}: TimelineDragBarProps) {
  const safeMax = Math.max(0, max);
  const safeValue = Math.min(Math.max(0, value), safeMax);

  return (
    <div className="w-full rounded-md border border-gray-200 bg-white px-3 py-2">
      <input
        type="range"
        min={0}
        max={safeMax}
        value={safeValue}
        aria-label={ariaLabel}
        disabled={safeMax <= 0}
        onChange={(e) => {
          onChange(Number(e.target.value));
        }}
        className="h-3 w-full cursor-pointer appearance-none rounded-full bg-gray-300 disabled:cursor-default disabled:opacity-50 [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-slate-600 [&::-moz-range-thumb]:shadow-sm [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-slate-600 [&::-webkit-slider-thumb]:shadow-sm"
      />
    </div>
  );
}

type VerticalScrollHintProps = {
  className?: string;
};

export function VerticalScrollHint({ className = "" }: VerticalScrollHintProps) {
  return (
    <div
      className={`pointer-events-none absolute bottom-2 right-2 rounded-full bg-white/90 px-2 py-1 text-xs font-medium text-gray-500 shadow-sm ring-1 ring-gray-200 ${className}`}
      aria-hidden="true"
    >
      Scroll ↓
    </div>
  );
}