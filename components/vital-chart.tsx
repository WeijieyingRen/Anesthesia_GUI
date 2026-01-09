// vital-chart.tsx

"use client";

import React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

type WavePoint = { time: number; value: number };
type MultiSeries = Record<string, WavePoint[] | undefined>;

interface VitalsChartProps {
  title: string;
  data?: WavePoint[];
  data2?: WavePoint[];
  data3?: WavePoint[];
  dataGroup?: MultiSeries;
  currentMinute: number;
  xDomain: [number, number];
}

/**
 * Renders one or more waveform lines (vitals or meds)
 * in a synchronized time domain.
 */
export default function VitalsChart({
  title,
  data,
  data2,
  data3,
  dataGroup,
  currentMinute,
  xDomain,
}: VitalsChartProps) {
  // flatten group into array of series
  const groupedEntries =
    dataGroup && Object.keys(dataGroup).length
      ? Object.entries(dataGroup).filter(([_, arr]) => Array.isArray(arr) && arr.length)
      : [];

  // combine all points for unified chart scaling
  const merged =
    groupedEntries.length > 0
      ? groupedEntries.flatMap(([label, arr]) =>
          (arr ?? []).map((p) => ({ time: p.time, value: p.value, label }))
        )
      : [];

  // deduplicate times for recharts
  const chartData =
    groupedEntries.length > 0
      ? Array.from(
          merged.reduce((map, p) => {
            if (!map.has(p.time)) map.set(p.time, { time: p.time });
            (map.get(p.time) as any)[p.label] = p.value;
            return map;
          }, new Map<number, any>())
        ).map(([_, v]) => v)
      : data?.map((d, i) => ({
          time: d.time,
          v1: d.value,
          v2: data2?.[i]?.value,
          v3: data3?.[i]?.value,
        })) ?? [];

  return (
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      <div className="flex justify-between items-center mb-1">
        <h3 className="text-xs font-medium text-gray-600 mb-1">{title}</h3>
        <div className="text-xs text-gray-500">min {currentMinute}</div>
      </div>
      <div className="h-32 w-full">
        <ResponsiveContainer>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis
              dataKey="time"
              domain={xDomain}
              type="number"
              tick={{ fontSize: 10 }}
              stroke="#888"
            />
            <YAxis
              width={40}
              tick={{ fontSize: 10 }}
              stroke="#888"
              allowDecimals={true}
              domain={[
                (dataMin: number) => Math.min(0, dataMin),
                (dataMax: number) => (dataMax <= 0 ? 1 : Math.ceil(dataMax * 1.1)),
              ]}
              tickFormatter={(v) => (v < 1 ? v.toFixed(2) : v.toFixed(0))}
            />
            <Tooltip />
            {groupedEntries.length > 0 ? (
              groupedEntries.map(([label], i) => (
                <Line
                  key={label}
                  type="monotone"
                  dataKey={label}
                  strokeWidth={1.5}
                  dot={false}
                  stroke={`hsl(${(i * 60) % 360}, 70%, 45%)`}
                  isAnimationActive={false}
                />
              ))
            ) : (
              <>
                {data && <Line type="monotone" dataKey="v1" stroke="#2563eb" strokeWidth={1.5} dot={false} />}
                {data2 && <Line type="monotone" dataKey="v2" stroke="#10b981" strokeWidth={1.5} dot={false} />}
                {data3 && <Line type="monotone" dataKey="v3" stroke="#f59e0b" strokeWidth={1.5} dot={false} />}
              </>
            )}
            {groupedEntries.length > 0 && <Legend />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
