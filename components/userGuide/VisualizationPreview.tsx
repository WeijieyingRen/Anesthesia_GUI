"use client";

export type VisualizationPreviewMode =
  | "overview"
  | "timeline"
  | "resolution"
  | "scroll"
  | "gas"
  | "medication"
  | "vitals"
  | "ventilation";

export default function VisualizationPreview({
  mode,
}: {
  mode: VisualizationPreviewMode;
}) {
  const highlightClass = "ring-2 ring-orange-400 bg-orange-50";

  if (mode === "overview") {
    const rows = [
      "Timeline and Events",
      "Gas",
      "Medications",
      "Vitals",
      "Temperature",
      "CV",
      "Ventilation",
    ];

    return (
      <div className="mt-4 rounded-xl border border-purple-100 bg-purple-50 p-4">
        <div className="mb-3 text-sm font-semibold text-purple-950">
          Visualization panel demo
        </div>

        <div className="rounded-xl border border-purple-300 bg-white p-3">
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row}
                className="flex items-center gap-2 rounded-lg border border-purple-100 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-950"
              >
                <span>▸</span>
                <span>{row}</span>
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-md bg-white px-3 py-2 text-xs font-bold text-red-600 shadow-sm">
            Click it to unfold or collapse the panel.
          </div>
        </div>
      </div>
    );
  }

  if (mode === "gas") {
    return (
      <div className="mt-4 rounded-xl border border-purple-100 bg-purple-50 p-4">
        <div className="mb-3 text-sm font-semibold text-purple-950">
          Gas panel demo
        </div>

        <div className="rounded-xl border border-purple-300 bg-white p-3">
          <div className={`rounded-lg border p-3 ${highlightClass}`}>
            <div className="mb-3 text-xs font-bold text-purple-950">▼ Gas</div>

            <div className="grid grid-cols-[96px_24px_1fr] gap-x-2 gap-y-2 text-[11px]">
              <div>O₂ (L/Min)</div>
              <div className="h-3 w-3 rounded-sm bg-green-500" />
              <div className="relative h-5 rounded bg-gray-50">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.35)_1px,transparent_1px)] bg-[length:28px_100%]" />
                <div className="absolute left-[58%] top-1.5 h-1.5 w-9 rounded bg-green-500" />
              </div>

              <div>Air (L/min)</div>
              <div className="h-3 w-3 rounded-sm bg-slate-500" />
              <div className="relative h-5 rounded bg-gray-50">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.35)_1px,transparent_1px)] bg-[length:28px_100%]" />
                <div className="absolute left-[62%] top-1.5 h-1.5 w-9 rounded bg-slate-500" />
              </div>

              <div>inO₂ %</div>
              <div className="h-3 w-3 rounded-sm bg-blue-600" />
              <div className="relative h-8 rounded bg-gray-50">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.35)_1px,transparent_1px)] bg-[length:28px_100%]" />

                <span className="absolute left-[2%] top-1 rounded px-1 text-[10px] text-purple-900">
                  53
                </span>
                <span className="absolute left-[11%] top-2.5 h-1.5 w-9 rounded bg-blue-600" />

                <div className="absolute left-[25%] top-0 flex items-center rounded-full border-2 border-red-500 bg-white/80 px-1.5 py-0.5">
                  <span className="text-[10px] font-semibold text-purple-900">
                    98
                  </span>
                  <span className="ml-1 h-1.5 w-10 rounded bg-blue-600" />
                </div>

                <div className="absolute left-[43%] top-2.5 h-1.5 w-9 rounded bg-blue-600" />

                <div className="absolute left-[23%] top-[25px] whitespace-nowrap text-[11px] font-bold text-red-600">
                  ↑ Click value + segment to visualize trajectory.
                </div>
              </div>

              <div>etMAC</div>
              <div className="h-3 w-3 rounded-sm bg-emerald-600" />
              <div className="relative h-5 rounded bg-gray-50">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.35)_1px,transparent_1px)] bg-[length:28px_100%]" />
                <span className="absolute left-[45%] top-0.5 text-[10px]">
                  0.3
                </span>
                <span className="absolute left-[52%] top-1.5 h-1.5 w-9 rounded bg-emerald-600" />
              </div>
            </div>

            <div className="mt-5 rounded-lg border bg-white p-3">
              <div className="mb-1 flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-purple-950">
                    inO₂ % detailed trajectory
                  </div>
                  <div className="text-[10px] text-gray-500">
                    Example output after clicking one gas value segment
                  </div>
                </div>

                <div className="rounded border px-2 py-0.5 text-[10px] text-gray-600">
                  Close
                </div>
              </div>

              <div className="relative mt-2 h-28 rounded border border-gray-200 bg-white">
                <div className="absolute inset-x-8 bottom-7 top-5 bg-[linear-gradient(to_right,rgba(148,163,184,0.35)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.35)_1px,transparent_1px)] bg-[length:40px_100%,100%_28px]" />

                <div className="absolute left-8 right-4 top-5 h-px bg-gray-300" />
                <div className="absolute left-8 right-4 bottom-7 h-px bg-gray-300" />

                <div className="absolute left-1 top-3 text-[10px] text-gray-500">
                  98
                </div>
                <div className="absolute left-1 bottom-5 text-[10px] text-gray-500">
                  51
                </div>

                <svg
                  className="absolute inset-0 h-full w-full"
                  viewBox="0 0 320 112"
                  preserveAspectRatio="none"
                >
                  <polyline
                    points="28,82 78,88 130,26 178,24 228,26 284,24"
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="3"
                  />
                  <circle cx="28" cy="82" r="3" fill="#2563eb" />
                  <circle cx="78" cy="88" r="3" fill="#2563eb" />
                  <circle cx="130" cy="26" r="3" fill="#2563eb" />
                  <circle cx="178" cy="24" r="3" fill="#2563eb" />
                  <circle cx="228" cy="26" r="3" fill="#2563eb" />
                  <circle cx="284" cy="24" r="3" fill="#2563eb" />
                </svg>

                <div className="absolute bottom-1 left-8 text-[10px] text-gray-500">
                  08:22
                </div>
                <div className="absolute bottom-1 right-4 text-[10px] text-gray-500">
                  08:29
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "medication") {
    return (
      <div className="mt-4 rounded-xl border border-purple-100 bg-purple-50 p-4">
        <div className="mb-3 text-sm font-semibold text-purple-950">
          Medication panel demo
        </div>

        <div className="rounded-xl border border-purple-300 bg-white p-3">
          <div className={`rounded-lg border p-3 ${highlightClass}`}>
            <div className="mb-3 text-xs font-bold text-purple-950">
              ▼ Medications
            </div>

            <div className="p-1">
              <div className="grid grid-cols-[74px_58px_1fr] gap-x-1 gap-y-4 text-[11px]">
                <div className="flex h-8 items-center font-medium text-gray-800">
                  propofol
                </div>

                <div className="relative flex h-8 items-center justify-start gap-1">
                  <span className="text-gray-600">100 mg</span>
                  <span className="h-3 w-3 rounded-sm border-2 border-red-500 bg-lime-500" />
                </div>

                <div className="relative h-8">
                  <div className="absolute -top-6 left-0 whitespace-nowrap text-[11px] font-bold text-red-600">
                    ↓ Click color square to hide/show this row.
                  </div>

                  <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.35)_1px,transparent_1px)] bg-[length:28px_100%]" />

                  <span className="absolute left-[18%] top-0 rounded bg-emerald-100 px-1 text-[10px] text-gray-700">
                    100
                  </span>

                  <div className="absolute left-[22%] top-3 h-1.5 w-[52%] rounded bg-emerald-600" />

                  <span className="absolute right-[16%] top-0 rounded bg-lime-100 px-1 text-[10px] text-gray-700">
                    70
                  </span>
                </div>

                <div className="flex h-32 items-center font-medium text-gray-800">
                  fentanyl
                </div>

                <div className="flex h-32 items-center justify-end gap-1">
                  <span className="text-gray-600">175 mcg</span>
                  <span className="h-3 w-3 rounded-sm bg-sky-400" />
                </div>

                <div className="relative h-32">
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.35)_1px,transparent_1px)] bg-[length:28px_100%]" />

                  <div className="absolute left-[4%] top-[32px] whitespace-nowrap text-[11px] font-bold text-red-600">
                    ↓ Click value/icon to show medication details.
                  </div>

                  <div className="absolute left-[8%] top-[58px] flex items-center">
                    <span className="h-4 w-1.5 rounded-sm bg-sky-400" />
                    <span className="rounded-r border-2 border-l-0 border-red-500 bg-sky-100 px-1 text-[10px] font-semibold text-gray-800">
                      25
                    </span>
                  </div>

                  <div className="absolute left-[34%] top-[48px] w-28 rounded-lg border bg-white px-2.5 py-2 text-[11px] text-gray-800 shadow-lg">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-bold">fentanyl</span>
                      <span className="text-sm font-bold text-gray-500">×</span>
                    </div>
                    <div>Time: 08:55</div>
                    <div>Dose: 25 mcg</div>
                  </div>

                  <div className="absolute left-[34%] top-[102px] max-w-[118px] rounded-md bg-white px-2 py-1 text-[10px] font-semibold text-purple-900 shadow-sm">
                    Tooltip shows name, time, and dose.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "vitals") {
    return (
      <div className="mt-4 rounded-xl border border-purple-100 bg-purple-50 p-4">
        <div className="mb-3 text-sm font-semibold text-purple-950">
          Vitals panel demo
        </div>

        <div className="rounded-xl border border-purple-300 bg-white p-3">
          <div className={`rounded-lg border p-3 ${highlightClass}`}>
            <div className="mb-3 text-xs font-bold text-purple-950">
              ▼ Vitals
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border bg-white p-2">
                <div className="mb-2 text-[11px] font-bold text-purple-950">
                  Before clicking
                </div>

                <div className="grid grid-cols-[58px_20px_1fr] gap-x-2 gap-y-2 text-[10px]">
                  <div className="flex h-7 items-center text-gray-800">HR</div>
                  <div className="flex h-7 items-center justify-center">
                    <span className="h-3 w-3 rounded-sm bg-rose-500" />
                  </div>
                  <div className="relative h-7">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.35)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.25)_1px,transparent_1px)] bg-[length:22px_100%,100%_14px]" />
                    <svg
                      className="absolute inset-0 h-full w-full"
                      viewBox="0 0 150 28"
                      preserveAspectRatio="none"
                    >
                      <polyline
                        points="0,16 25,13 50,17 75,12 100,15 125,13 150,14"
                        fill="none"
                        stroke="#f43f5e"
                        strokeWidth="3"
                      />
                    </svg>
                  </div>

                  <div className="flex h-7 items-center text-gray-800">MAP</div>
                  <div className="flex h-7 items-center justify-center">
                    <span className="h-3 w-3 rounded-sm border-2 border-red-500 bg-blue-500" />
                  </div>
                  <div className="relative h-7">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.35)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.25)_1px,transparent_1px)] bg-[length:22px_100%,100%_14px]" />
                    <svg
                      className="absolute inset-0 h-full w-full"
                      viewBox="0 0 150 28"
                      preserveAspectRatio="none"
                    >
                      <polyline
                        points="0,17 25,16 50,19 75,17 100,18 125,16 150,18"
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="3"
                      />
                    </svg>
                  </div>

                  <div className="flex h-7 items-center text-gray-800">
                    SpO₂
                  </div>
                  <div className="flex h-7 items-center justify-center">
                    <span className="h-3 w-3 rounded-sm bg-emerald-500" />
                  </div>
                  <div className="relative h-7">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.35)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.25)_1px,transparent_1px)] bg-[length:22px_100%,100%_14px]" />
                    <svg
                      className="absolute inset-0 h-full w-full"
                      viewBox="0 0 150 28"
                      preserveAspectRatio="none"
                    >
                      <polyline
                        points="0,10 25,9 50,9 75,10 100,9 125,8 150,9"
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="3"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border bg-white p-2">
                <div className="mb-2 text-[11px] font-bold text-purple-950">
                  After clicking MAP color square
                </div>

                <div className="grid grid-cols-[58px_20px_1fr] gap-x-2 gap-y-2 text-[10px]">
                  <div className="flex h-7 items-center text-gray-800">HR</div>
                  <div className="flex h-7 items-center justify-center">
                    <span className="h-3 w-3 rounded-sm bg-rose-500" />
                  </div>
                  <div className="relative h-7">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.35)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.25)_1px,transparent_1px)] bg-[length:22px_100%,100%_14px]" />
                    <svg
                      className="absolute inset-0 h-full w-full"
                      viewBox="0 0 150 28"
                      preserveAspectRatio="none"
                    >
                      <polyline
                        points="0,16 25,13 50,17 75,12 100,15 125,13 150,14"
                        fill="none"
                        stroke="#f43f5e"
                        strokeWidth="3"
                      />
                    </svg>
                  </div>

                  <div className="flex h-7 items-center text-gray-800">MAP</div>
                  <div className="flex h-7 items-center justify-center">
                    <span className="h-3 w-3 rounded-sm border-2 border-red-500 bg-blue-500" />
                  </div>
                  <div className="relative h-7">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.35)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.25)_1px,transparent_1px)] bg-[length:22px_100%,100%_14px]" />
                    <div className="absolute left-[18%] top-1 rounded-md bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-600 shadow-sm">
                      MAP hidden
                    </div>
                  </div>

                  <div className="flex h-7 items-center text-gray-800">
                    SpO₂
                  </div>
                  <div className="flex h-7 items-center justify-center">
                    <span className="h-3 w-3 rounded-sm bg-emerald-500" />
                  </div>
                  <div className="relative h-7">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.35)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.25)_1px,transparent_1px)] bg-[length:22px_100%,100%_14px]" />
                    <svg
                      className="absolute inset-0 h-full w-full"
                      viewBox="0 0 150 28"
                      preserveAspectRatio="none"
                    >
                      <polyline
                        points="0,10 25,9 50,9 75,10 100,9 125,8 150,9"
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="3"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-purple-900 shadow-sm">
              Click a color square on the left to hide or show the corresponding
              vital sign row. This makes the remaining trends easier to see.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "ventilation") {
    return (
      <div className="mt-4">
     

        <div className="rounded-xl border border-purple-300 bg-white p-3">
        <div className="rounded-lg border-2 border-orange-400 bg-orange-50/40 p-3">
            <div className="mb-3 text-xs font-bold text-purple-950">
              ▼ Ventilation
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-2">
              <div className="grid grid-cols-[74px_18px_1fr] gap-x-2 text-[10px] text-gray-800">
                <div className="space-y-1">
                  {[
                    "RR",
                    "TV",
                    "MV",
                    "PEEP",
                    "PIP",
                    "Mean PIP",
                    "Plateau PIP",
                  ].map((label) => (
                    <div key={label} className="flex h-5 items-center">
                      {label}
                    </div>
                  ))}
                </div>

                <div className="space-y-1 pt-0.5">
                  <div className="h-4 w-3 rounded-sm bg-blue-500" />
                  <div className="h-4 w-3 rounded-sm bg-blue-600" />
                  <div className="h-4 w-3 rounded-sm bg-violet-600" />
                  <div className="h-4 w-3 rounded-sm bg-red-500" />
                  <div className="h-4 w-3 rounded-sm bg-orange-500" />
                  <div className="h-4 w-3 rounded-sm bg-green-500" />
                  <div className="h-4 w-3 rounded-sm bg-purple-500" />
                </div>

                <div className="relative h-[148px] overflow-hidden rounded bg-gray-50">
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.45)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.32)_1px,transparent_1px)] bg-[length:30px_100%,100%_21px]" />

                  <div className="absolute left-[16%] top-[25px] flex items-center gap-1">
                    <span className="text-[9px] text-gray-700">496</span>
                    <span className="h-1.5 w-7 rounded bg-blue-600" />
                  </div>

                  <div className="absolute left-[35%] top-[25px] flex items-center gap-1">
                    <span className="text-[9px] text-gray-700">342</span>
                    <span className="h-1.5 w-7 rounded bg-blue-600" />
                  </div>

                  <div className="absolute left-[54%] top-[25px] flex items-center gap-1">
                    <span className="text-[9px] text-gray-700">383</span>
                    <span className="h-1.5 w-7 rounded bg-blue-600" />
                  </div>

                  <div className="absolute left-[73%] top-[25px] flex items-center gap-1">
                    <span className="text-[9px] text-gray-700">355</span>
                    <span className="h-1.5 w-7 rounded bg-blue-600" />
                  </div>

                  <div className="absolute left-[16%] top-[46px] flex items-center gap-1">
                    <span className="text-[9px] text-gray-700">4.4</span>
                    <span className="h-1.5 w-7 rounded bg-violet-600" />
                  </div>

                  <div className="absolute left-[35%] top-[40px] flex items-center gap-1 rounded border-2 border-orange-400 bg-white px-1 py-0.5 shadow-sm">
                    <span className="text-[9px] font-semibold text-gray-700">
                      3.7
                    </span>
                    <span className="h-1.5 w-8 rounded bg-violet-600" />
                  </div>

                  <div className="absolute left-[54%] top-[46px] flex items-center gap-1">
                    <span className="text-[9px] text-gray-700">3.8</span>
                    <span className="h-1.5 w-7 rounded bg-violet-600" />
                  </div>

                  <div className="absolute left-[73%] top-[46px] flex items-center gap-1">
                    <span className="text-[9px] text-gray-700">3.6</span>
                    <span className="h-1.5 w-7 rounded bg-violet-600" />
                  </div>

                  <div className="absolute left-[18%] top-[67px] flex items-center gap-1">
                    <span className="text-[9px] text-gray-700">0</span>
                    <span className="h-1.5 w-8 rounded bg-red-500" />
                  </div>

                  <div className="absolute left-[42%] top-[67px] flex items-center gap-1">
                    <span className="text-[9px] text-gray-700">5</span>
                    <span className="h-1.5 w-8 rounded bg-red-500" />
                  </div>

                  <div className="absolute left-[66%] top-[67px] flex items-center gap-1">
                    <span className="text-[9px] text-gray-700">5</span>
                    <span className="h-1.5 w-8 rounded bg-red-500" />
                  </div>

                  <div className="absolute left-[18%] top-[88px] flex items-center gap-1">
                    <span className="text-[9px] text-gray-700">26</span>
                    <span className="h-1.5 w-8 rounded bg-orange-500" />
                  </div>

                  <div className="absolute left-[48%] top-[88px] flex items-center gap-1">
                    <span className="text-[9px] text-gray-700">15</span>
                    <span className="h-1.5 w-8 rounded bg-orange-500" />
                  </div>

                  <div className="absolute left-[22%] top-[109px] flex items-center gap-1">
                    <span className="text-[9px] text-gray-700">7</span>
                    <span className="h-1.5 w-8 rounded bg-green-500" />
                  </div>

                  <div className="absolute left-[53%] top-[109px] flex items-center gap-1">
                    <span className="text-[9px] text-gray-700">8</span>
                    <span className="h-1.5 w-8 rounded bg-green-500" />
                  </div>

                  <div className="absolute left-[30%] top-[130px] flex items-center gap-1">
                    <span className="text-[9px] text-gray-700">12</span>
                    <span className="h-1.5 w-8 rounded bg-purple-500" />
                  </div>

                  <div className="absolute left-[60%] top-[130px] flex items-center gap-1">
                    <span className="text-[9px] text-gray-700">13</span>
                    <span className="h-1.5 w-8 rounded bg-purple-500" />
                  </div>

                  <div className="absolute left-[26%] top-[8px] rounded-md bg-white/95 px-2 py-1 text-[10px] font-bold text-red-600 shadow-md">
                    ↓ Click an MV segment.
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-full bg-gray-200 p-1">
                <div className="h-2 w-1/4 rounded-full bg-gray-500" />
              </div>
            </div>

            <div className="mt-4 rounded-lg border bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-purple-950">
                    MV detail
                  </div>
                  <div className="text-[10px] text-gray-500">09:00 – 09:14</div>
                </div>

                <div className="rounded border px-2 py-0.5 text-[10px] text-gray-600">
                  Close
                </div>
              </div>

              <div className="relative mt-2 h-24 rounded border border-gray-200 bg-white">
                <div className="absolute inset-x-8 bottom-7 top-5 bg-[linear-gradient(to_right,rgba(148,163,184,0.35)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.35)_1px,transparent_1px)] bg-[length:44px_100%,100%_30px]" />

                <div className="absolute left-1 top-3 text-[10px] text-gray-500">
                  3.8
                </div>
                <div className="absolute left-1 bottom-5 text-[10px] text-gray-500">
                  3.7
                </div>

                <svg
                  className="absolute inset-0 h-full w-full"
                  viewBox="0 0 360 128"
                  preserveAspectRatio="none"
                >
                  <polyline
                    points="26,92 70,92 114,20 158,92 202,92 246,20 290,20 334,92"
                    fill="none"
                    stroke="#7c3aed"
                    strokeWidth="3"
                  />
                  <circle cx="26" cy="92" r="3.5" fill="#7c3aed" />
                  <circle cx="70" cy="92" r="3.5" fill="#7c3aed" />
                  <circle cx="114" cy="20" r="3.5" fill="#7c3aed" />
                  <circle cx="158" cy="92" r="3.5" fill="#7c3aed" />
                  <circle cx="202" cy="92" r="3.5" fill="#7c3aed" />
                  <circle cx="246" cy="20" r="3.5" fill="#7c3aed" />
                  <circle cx="290" cy="20" r="3.5" fill="#7c3aed" />
                  <circle cx="334" cy="92" r="3.5" fill="#7c3aed" />
                </svg>

                <div className="absolute bottom-1 left-8 text-[10px] text-gray-500">
                  09:00
                </div>
                <div className="absolute bottom-1 right-4 text-[10px] text-gray-500">
                  09:14
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-purple-900 shadow-sm">
              Click a ventilation value segment, such as MV, to open the
              detailed trajectory below the ventilation panel.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const onlyShowTimelineDemo = mode === "scroll";

  return (
    <div className="mt-4 rounded-xl border border-purple-100 bg-purple-50 p-4">
      <div className="mb-3 text-sm font-semibold text-purple-950">
        Visualization panel demo
      </div>

      <div className="rounded-xl border border-purple-300 bg-white p-3">
        <div
          className={`mb-3 rounded-lg border p-3 ${
            ["timeline", "resolution", "scroll"].includes(mode)
              ? highlightClass
              : "bg-white"
          }`}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs font-bold text-purple-950">
              ▼ Timeline and Events
            </div>

            <div
              className={`flex rounded-full border bg-white p-1 text-[11px] ${
                mode === "resolution" ? "ring-2 ring-orange-400" : ""
              }`}
            >
              <span className="rounded-full bg-blue-600 px-2 py-0.5 font-semibold text-white">
                15 min
              </span>
              <span className="px-2 py-0.5 font-semibold text-gray-600">
                5 min
              </span>
            </div>
          </div>

          <div className="relative h-14 rounded-md bg-purple-50">
            <div className="absolute left-4 right-4 top-7 h-0.5 bg-purple-400" />
            <div className="absolute left-4 top-4 text-[10px] font-semibold text-purple-800">
              Anes Start
            </div>
            <div className="absolute left-[35%] top-4 text-[10px] font-semibold text-purple-800">
              Induction
            </div>
            <div className="absolute left-[52%] top-4 text-[10px] font-semibold text-purple-800">
              Proc Start
            </div>
            <div className="absolute right-4 top-4 text-[10px] font-semibold text-purple-800">
              Extubation
            </div>
          </div>

          <div
            className={`mt-3 rounded-full bg-gray-200 p-1 ${
              mode === "scroll" ? "ring-2 ring-orange-400" : ""
            }`}
          >
            <div className="h-2 w-1/3 rounded-full bg-gray-500" />
          </div>

          {mode === "resolution" && (
            <div className="mt-2 text-xs font-bold text-red-600">
              Click 15 min or 5 min to choose the resolution.
            </div>
          )}

          {mode === "scroll" && (
            <div className="mt-2 text-xs font-bold text-red-600">
              Drag the scroll bar to visualize the whole timeline.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}