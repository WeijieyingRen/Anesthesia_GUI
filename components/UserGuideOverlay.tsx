"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import VisualizationPreview, {
  type VisualizationPreviewMode,
} from "@/components/userGuide/VisualizationPreview";

type NavGroup = "layout" | "preop" | "annotation" | "visualization" | "submit";

type AnnotationTaskForGuide = "summary" | "abnormality" | "management";

type GuideStep = {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  selector: string;
  navGroup: NavGroup;
  hidePreview?: true;
  highlightMode?:
    | "layout"
    | "preop"
    | "annotation-panel"
    | "annotation-tabs"
    | "annotation-instructions"
    | "annotation-text"
    | "annotation-voice"
    | "annotation-save"
    | "annotation-abnormality"
    | "annotation-abnormality-draw"
    | "annotation-abnormality-review"
    | "annotation-abnormality-adjust"
    | "annotation-abnormality-save"
    | "annotation-management"
    | "annotation-management-instructions"
    | "annotation-management-focused-event"
    | "annotation-management-right-panel"
    | "annotation-management-text"
    | "annotation-management-save"
    | "visualization-panel"
    | "visualization-timeline"
    | "visualization-resolution"
    | "visualization-time-scroll"
    | "visualization-gas-overview"
    | "visualization-gas"
    | "visualization-medication-overview"
    | "visualization-medication"
    | "visualization-vitals-overview"
    | "visualization-vitals"
    | "visualization-ventilation-overview"
    | "visualization-ventilation"
    | "submit";
  cardPlacement?: "left" | "right" | "center";
  compactCard?: true;
  screenNote?: {
    text: string;
    placement:
      | "inside-top"
      | "inside-bottom"
      | "below"
      | "timeline-scroll"
      | "resolution-control";
  };
  layoutPreview?: true;
  preopPreview?: true;
  realAnnotationTask?: AnnotationTaskForGuide;
  annotationPreview?: {
    mode:
      | "panel"
      | "tabs"
      | "instructions"
      | "text"
      | "voice"
      | "save"
      | "switch"
      | "abnormality"

      | "management";
  };
  visualizationPreview?: {
    mode: VisualizationPreviewMode;
  };
};

type HighlightRect = {
  label?: string;
  top: number;
  left: number;
  width: number;
  height: number;
};

type UserGuideOverlayProps = {
  open: boolean;
  onClose: () => void;
};

const NAV_GROUPS: Array<{ key: NavGroup; label: string }> = [
  { key: "layout", label: "Layout" },
  { key: "preop", label: "Pre-op info" },
  { key: "visualization", label: "Visualization" },
  { key: "annotation", label: "Annotation task" },
  { key: "submit", label: "Submit" },
];

const GUIDE_STEPS: GuideStep[] = [
  {
    id: "layout",
    title: "Step 1: Understand the page layout",
    shortTitle: "Layout",
    navGroup: "layout",
    description: "",
    selector: '[data-guide="dashboard-overview"]',
    highlightMode: "layout",
    cardPlacement: "right",
  },
  {
    id: "preop-info",
    title: "Step 2: Review pre-operative information",
    shortTitle: "Pre-op info",
    navGroup: "preop",
    description:
      "Click the pre-operative information panel to expand or collapse it.",
    selector: '[data-guide="preop-info"]',
    highlightMode: "preop",
    cardPlacement: "right",
    screenNote: {
      text: "↑ Click to expand or collapse the panel to review the full pre-operative content.",
      placement: "inside-bottom",
    },
    preopPreview: true,
  },

  {
    id: "visualization-workflow",
    title: "Step 3: read the visualization panel",
    shortTitle: "Visualization",
    navGroup: "visualization",
    description:
      " ",
    selector: '[data-guide="visualization-panel"]',
    highlightMode: "visualization-panel",
    cardPlacement: "left",
    screenNote: {
      text: "Click each section title to unfold or collapse the panel.",
      placement: "inside-top",
    },
    visualizationPreview: {
      mode: "overview",
    },
  },
  {
    id: "visualization-timeline-events",
    title: "Step 3: Review timeline events",
    shortTitle: "Visualization",
    navGroup: "visualization",
    description:
      " ",
    selector: '[data-guide="visualization-panel"]',
    highlightMode: "visualization-timeline",
    cardPlacement: "left",
    hidePreview: true,
    screenNote: {
      text: "Use timeline events to anchor your reasoning.",
      placement: "below",
    },
    visualizationPreview: {
      mode: "timeline",
    },
  },
  {
    id: "visualization-resolution",
    title: "Step 3: Choose time resolution",
    shortTitle: "Visualization",
    navGroup: "visualization",
    hidePreview: true,
    description:
      " ",
    selector: '[data-guide="visualization-panel"]',
    highlightMode: "visualization-resolution",
    cardPlacement: "left",
    screenNote: {
      text: "Click 15 min or 5 min to choose the resolution you want to view.",
      placement: "resolution-control",
    },
    visualizationPreview: {
      mode: "resolution",
    },
  },
  {
    id: "visualization-time-scroll",
    title: "Step 3: Drag the timeline scroll bar",
    shortTitle: "Visualization",
    navGroup: "visualization",
    description: " ",
    selector: '[data-guide="visualization-panel"]',
    highlightMode: "visualization-time-scroll",
    cardPlacement: "left",
    hidePreview: true,
    screenNote: {
      text: "↘ For longer cases, a timeline scroll bar will appear. Drag the bar to view the full case timeline.",
      placement: "timeline-scroll",
    },
    visualizationPreview: {
      mode: "scroll",
    },
  },
  {
    id: "visualization-gas-overview",
    title: "Step 3: Gas panel",
    shortTitle: "Visualization",
    navGroup: "visualization",
    description: "",
    selector: '[data-guide="visualization-panel"]',
    highlightMode: "visualization-gas-overview",
    cardPlacement: "left",
    visualizationPreview: {
      mode: "gas",
    },
  },
  {
    id: "visualization-gas",
    title: "Step 3: Inspect gas values and detailed trajectory",
    shortTitle: "Visualization",
    navGroup: "visualization",
    description:
      " ",
    selector: '[data-guide="visualization-panel"]',
    highlightMode: "visualization-gas",
    cardPlacement: "left",
    visualizationPreview: {
      mode: "gas",
    },
  },
  {
    id: "visualization-medication-overview",
    title: "Step 3: Medication panel",
    shortTitle: "Visualization",
    navGroup: "visualization",
    description:
      " ",
    selector: '[data-guide="visualization-panel"]',
    highlightMode: "visualization-medication-overview",
    cardPlacement: "left",
  },
  {
    id: "visualization-medication",
    title: "Step 3: Inspect medication value and units",
    shortTitle: "Visualization",
    navGroup: "visualization",
    description:
      " ",
    selector: '[data-guide="visualization-panel"]',
    highlightMode: "visualization-medication",
    cardPlacement: "left",
  },
  {
    id: "visualization-vitals-overview",
    title: "Step 3: Vitals panel",
    shortTitle: "Visualization",
    navGroup: "visualization",
    description: " ",
    selector: '[data-guide="visualization-panel"]',
    highlightMode: "visualization-vitals-overview",
    cardPlacement: "left",
    visualizationPreview: {
      mode: "vitals",
    },
  },
  {
    id: "visualization-vitals",
    title: "Step 3: Hide or show vital sign rows",
    shortTitle: "Visualization",
    navGroup: "visualization",
    description:
      " ",
    selector: '[data-guide="visualization-panel"]',
    highlightMode: "visualization-vitals",
    cardPlacement: "left",
    visualizationPreview: {
      mode: "vitals",
    },
  },
  {
    id: "visualization-ventilation-overview",
    title: "Step 3: Ventilation panel",
    shortTitle: "Visualization",
    navGroup: "visualization",
    description: "This section shows ventilation-related values during the case.",
    selector: '[data-guide="visualization-panel"]',
    highlightMode: "visualization-ventilation-overview",
    cardPlacement: "left",
    visualizationPreview: {
      mode: "ventilation",
    },
  },
  {
    id: "visualization-ventilation",
    title: "Step 3: Inspect ventilation value segments",
    shortTitle: "Visualization",
    navGroup: "visualization",
    description:
      "Click a ventilation value segment to open the detailed trajectory below the ventilation panel.",
    selector: '[data-guide="visualization-panel"]',
    highlightMode: "visualization-ventilation",
    cardPlacement: "left",
    visualizationPreview: {
      mode: "ventilation",
    },
  },


  {
    id: "annotation-tabs",
    title: "Step 4: Three annotation tasks In total",
    shortTitle: "Annotation task",
    navGroup: "annotation",
    description:
      " ",
    selector: '[data-guide="task-tabs"]',
    highlightMode: "annotation-tabs",
    cardPlacement: "right",
    hidePreview: true,
    realAnnotationTask: "summary",
    screenNote: {
      text: "Three tasks need to be finished. Click the buttons to switch tasks.",
      placement: "below",
    },
    annotationPreview: {
      mode: "tabs",
    },
  },
  {
    id: "annotation-instructions",
    title: "Step 4: Read task instructions, examples, and FAQ",
    shortTitle: "Annotation task",
    navGroup: "annotation",
    hidePreview: true,
    description:
      " ",
    selector: '[data-guide="instructions"]',
    highlightMode: "annotation-instructions",
    cardPlacement: "right",
    realAnnotationTask: "summary",
    screenNote: {
      text: "Click the instruction, example, or FAQ sections to unfold the detailed description before writing your answer.",
      placement: "below",
    },
    annotationPreview: {
      mode: "instructions",
    },
  },
  {
    id: "annotation-text",
    title: "Step 4: Type your response",
    shortTitle: "Annotation task",
    navGroup: "annotation",
    hidePreview: true,
    description:
      "Write your response in the text box. You can edit the text before saving.",
    selector: '[data-guide="instructions"]',
    highlightMode: "annotation-text",
    cardPlacement: "right",
    realAnnotationTask: "summary",
    screenNote: {
      text: "Record or type here.",
      placement: "below",
    },
    annotationPreview: {
      mode: "text",
    },
  },
  {
    id: "annotation-voice",
    title: "Step 4: Use speech input if needed",
    shortTitle: "Annotation task",
    navGroup: "annotation",
    hidePreview: true,
    description:
      "Choose language before start recording and click Stop Recording when you finish.",
    selector: '[data-guide="annotation-tasks"]',
    highlightMode: "annotation-voice",
    cardPlacement: "right",
    realAnnotationTask: "summary",
    screenNote: {
      text: "Choose a language, click Start Recording, and click Stop Recording when finished. Speech input supports English, Chinese, Hindi, and Bengali.",
      placement: "below",
    },
    annotationPreview: {
      mode: "voice",
    },
  },
  {
    id: "annotation-save",
    title: "Step 4: Save each task",
    shortTitle: "Annotation task",
    navGroup: "annotation",
    hidePreview: true,
    description:
      " ",
    selector: '[data-guide="annotation-tasks"]',
    highlightMode: "annotation-save",
    cardPlacement: "right",
    realAnnotationTask: "summary",
    screenNote: {
      text: "Click Save button when you finish one task. You must save before moving to the next task.",
      placement: "below",
    },
    annotationPreview: {
      mode: "save",
    },
  },
  {
    id: "annotation-switch",
    title: "Step 4: Switch to another unfinished task",
    shortTitle: "Annotation task",
    navGroup: "annotation",
    description:
      " ",
    selector: '[data-guide="task-tabs"]',
    hidePreview: true,
    highlightMode: "annotation-tabs",
    cardPlacement: "right",
    realAnnotationTask: "summary",
    screenNote: {
      text: "Once you finish one task, switch to another unfinished task using the task buttons.",
      placement: "below",
    },
    annotationPreview: {
      mode: "switch",
    },
  },
 
  {
    id: "annotation-abnormality-draw",
    title: "Step 4: Abnormality Reasoning Task",
    shortTitle: "Annotation task",
    navGroup: "annotation",
    description:
      " ",
    selector: '[data-guide="dashboard-overview"]',
    highlightMode: "annotation-abnormality-draw",
    cardPlacement: "left",
    compactCard: true,
    realAnnotationTask: "abnormality",
  },
  {
    id: "annotation-abnormality-review",
    title: "Step 4: Review detected episodes",
    shortTitle: "Annotation task",
    navGroup: "annotation",
    description:
      " ",
    selector: '[data-guide="dashboard-overview"]',
    highlightMode: "annotation-abnormality-review",
    cardPlacement: "left",
    compactCard: true,
    realAnnotationTask: "abnormality",
  },
  {
    id: "annotation-abnormality-adjust",
    title: "Step 4: Adjust episode boundaries",
    shortTitle: "Annotation task",
    navGroup: "annotation",
    description:
      " ",
    selector: '[data-guide="dashboard-overview"]',
    highlightMode: "annotation-abnormality-adjust",
    cardPlacement: "left",
    compactCard: true,
    realAnnotationTask: "abnormality",
  },
  {
    id: "annotation-abnormality-save",
    title: "Step 4: Detect all abnormality, Select one episode and save",
    shortTitle: "Annotation task",
    navGroup: "annotation",
    description:
      " ",
    selector: '[data-guide="dashboard-overview"]',
    highlightMode: "annotation-abnormality-save",
    cardPlacement: "left",
    compactCard: true,
    realAnnotationTask: "abnormality",
  },
  {
    id: "annotation-management-real",
    title: "Step 4: Management Reasoning",
    shortTitle: "Annotation task",
    navGroup: "annotation",
    description:
      "This is the Management Reasoning task. In this task, you will reason about one focused medication or gas event selected by the system.",
    selector: '[data-guide="annotation-tasks"]',
    highlightMode: "annotation-management",
    cardPlacement: "right",
    realAnnotationTask: "management",
    hidePreview: true,
    screenNote: {
      text: "This is the Management Reasoning task. Review the focused event, write your reasoning, then save the task.",
      placement: "below",
    },
    annotationPreview: {
      mode: "management",
    },
  },
  {
    id: "annotation-management-instructions",
    title: "Step 4: Read Management Reasoning instructions",
    shortTitle: "Annotation task",
    navGroup: "annotation",
    description:
      "Click Annotation Instructions, Example, and FAQ / Common Questions to expand them and read the detailed description before writing your reasoning.",
    selector: '[data-guide="annotation-tasks"]',
    highlightMode: "annotation-management-instructions",
    cardPlacement: "right",
    realAnnotationTask: "management",
    screenNote: {
      text: "Click each section to expand it and read the detailed instructions, example, and FAQ.",
      placement: "below",
    },
  },
  {
    id: "annotation-management-focused-event",
    title: "Step 4: Review the focused medication event",
    shortTitle: "Annotation task",
    navGroup: "annotation",
    description:
      " ",
    selector: '[data-guide="annotation-tasks"]',
    highlightMode: "annotation-management-focused-event",
    cardPlacement: "right",
    realAnnotationTask: "management",
    screenNote: {
      text: "This is the focused event selected by the system. Review its medication/gas name, time, type, and dose or value change. This management would also be highlighted in the right panel in the right medication or gas panel",
      placement: "below",
    },
  },
  {
    id: "annotation-management-right-panel",
    title: "Step 4: Find the highlighted event on the right panel",
    shortTitle: "Annotation task",
    navGroup: "annotation",
    description:
    " ",
     
    selector: '[data-guide="visualization-panel"]',
    highlightMode: "annotation-management-right-panel",
    cardPlacement: "left",
    realAnnotationTask: "management",
    screenNote: {
      text: "The corresponding event is highlighted here. Scroll the Medication or Gas panel if needed to find it.",
      placement: "below",
    },
  },
  {
    id: "annotation-management-text",
    title: "Step 4: Write or record your management reasoning",
    shortTitle: "Annotation task",
    navGroup: "annotation",
    description:
      " ",
    selector: '[data-guide="annotation-tasks"]',
    highlightMode: "annotation-management-text",
    cardPlacement: "right",
    realAnnotationTask: "management",
    screenNote: {
      text: "Write or record your reasoning here.",
      placement: "below",
    },
  },
  {
    id: "annotation-management-save",
    title: "Step 4: Save Management Reasoning",
    shortTitle: "Annotation task",
    navGroup: "annotation",
    description:
      "After finishing your management reasoning, click Save button to save this task.",
    selector: '[data-guide="annotation-tasks"]',
    highlightMode: "annotation-management-save",
    cardPlacement: "right",
    realAnnotationTask: "management",
    screenNote: {
      text: "Click Save button after you finish your reasoning.",
      placement: "below",
    },
  },

  {
    id: "submit",
    title: "Step 5: Submit the case",
    shortTitle: "Submit",
    navGroup: "submit",
    description:
      " ",
    selector: '[data-guide="submit-area"], [data-guide="dashboard-overview"]',
    highlightMode: "submit",
    cardPlacement: "left",
  },
];

function getTargetElement(selector: string) {
  if (typeof window === "undefined") return null;

  const selectors = selector
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  for (const item of selectors) {
    const el = document.querySelector(item);
    if (el) return el;
  }

  return null;
}

function getRectFromSelector(selector: string): HighlightRect | null {
  const el = getTargetElement(selector);
  if (!el) return null;

  const rect = el.getBoundingClientRect();

  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function getRectFromElement(el: Element): HighlightRect {
  const rect = el.getBoundingClientRect();

  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function getVisibleRect(rect: HighlightRect): HighlightRect {
  if (typeof window === "undefined") return rect;

  const top = Math.max(8, rect.top);
  const left = Math.max(8, rect.left);
  const right = Math.min(window.innerWidth - 8, rect.left + rect.width);
  const bottom = Math.min(window.innerHeight - 8, rect.top + rect.height);

  return {
    top,
    left,
    width: Math.max(80, right - left),
    height: Math.max(40, bottom - top),
  };
}

function elementTextIncludes(el: Element, keywords: string[]) {
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();

  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function findElementByText(root: Element, keywords: string[]) {
  const candidates = Array.from(
    root.querySelectorAll("div, section, article, button, span, h1, h2, h3, h4")
  )
    .filter((el) => elementTextIncludes(el, keywords))
    .sort((a, b) => {
      const aText = (a.textContent ?? "").replace(/\s+/g, " ").trim();
      const bText = (b.textContent ?? "").replace(/\s+/g, " ").trim();

      return aText.length - bText.length;
    });

  return candidates[0] ?? null;
}

function findAnnotationTaskTab(task: AnnotationTaskForGuide): HTMLElement | null {
  if (typeof window === "undefined") return null;

  const root =
    getTargetElement('[data-guide="task-tabs"]') ??
    getTargetElement('[data-guide="annotation-tasks"]');

  if (!root) return null;

  const keywordsByTask: Record<AnnotationTaskForGuide, string[]> = {
    summary: ["Summary"],
    abnormality: ["Abnormality Reasoning"],
    management: ["Management Reasoning"],
  };

  const candidates = Array.from(
    root.querySelectorAll("button, div, span")
  ) as HTMLElement[];

  const matched = candidates
    .filter((el) => elementTextIncludes(el, keywordsByTask[task]))
    .sort((a, b) => {
      const aText = (a.textContent ?? "").replace(/\s+/g, " ").trim();
      const bText = (b.textContent ?? "").replace(/\s+/g, " ").trim();
      return aText.length - bText.length;
    });

  return matched[0] ?? null;
}

function clickAnnotationTaskTab(task: AnnotationTaskForGuide) {
  const tab = findAnnotationTaskTab(task);
  if (!tab) return false;

  tab.click();
  return true;
}

function findSectionRectFromHeader(
  panel: Element,
  headerKeywords: string[],
  nextHeaderKeywords: string[]
): HighlightRect | null {
  const panelRect = getRectFromElement(panel);
  const headerEl = findElementByText(panel, headerKeywords);

  if (!headerEl) return null;

  const headerRect = getRectFromElement(headerEl);

  const nextHeaderEl = Array.from(
    panel.querySelectorAll("div, section, article, button, span, h1, h2, h3, h4")
  ).find((el) => {
    const rect = getRectFromElement(el);

    return (
      rect.top > headerRect.top + 24 &&
      elementTextIncludes(el, nextHeaderKeywords)
    );
  });

  const sectionTop = Math.max(panelRect.top, headerRect.top - 10);
  const sectionBottom = nextHeaderEl
    ? Math.min(
        getRectFromElement(nextHeaderEl).top - 6,
        panelRect.top + panelRect.height
      )
    : Math.min(
        sectionTop + Math.max(220, panelRect.height * 0.32),
        panelRect.top + panelRect.height
      );

  return getVisibleRect({
    top: sectionTop,
    left: panelRect.left,
    width: panelRect.width,
    height: Math.max(140, sectionBottom - sectionTop),
  });
}

function findVitalsSectionRect(panel: Element): HighlightRect | null {
  const panelRect = getRectFromElement(panel);

  const headerEl = findElementByText(panel, [
    "▼ Vitals",
    "▾ Vitals",
    "Vitals",
  ]);

  if (!headerEl) return null;

  const headerRect = getRectFromElement(headerEl);

  const nextHeaderEl = Array.from(
    panel.querySelectorAll("div, section, article, button, span, h1, h2, h3, h4")
  ).find((el) => {
    const rect = getRectFromElement(el);

    return (
      rect.top > headerRect.top + 120 &&
      elementTextIncludes(el, [
        "Ventilation",
        "Temperature",
        "CV",
        "Fluid",
        "Fluids",
      ])
    );
  });

  const sectionTop = Math.max(panelRect.top, headerRect.top - 10);

  const sectionBottom = nextHeaderEl
    ? Math.min(
        getRectFromElement(nextHeaderEl).top - 6,
        panelRect.top + panelRect.height
      )
    : Math.min(sectionTop + 430, panelRect.top + panelRect.height);

  return getVisibleRect({
    top: sectionTop,
    left: panelRect.left,
    width: panelRect.width,
    height: Math.max(320, sectionBottom - sectionTop),
  });
}

function findVentilationSectionRect(panel: Element): HighlightRect | null {
  const panelRect = getRectFromElement(panel);

  const headerEl = findElementByText(panel, [
    "▼ Ventilation",
    "▾ Ventilation",
    "Ventilation",
  ]);

  if (!headerEl) return null;

  const headerRect = getRectFromElement(headerEl);
  const sectionTop = Math.max(panelRect.top, headerRect.top - 10);

  return getVisibleRect({
    top: sectionTop,
    left: panelRect.left,
    width: panelRect.width,
    height: Math.max(
      260,
      Math.min(420, panelRect.top + panelRect.height - sectionTop)
    ),
  });
}

function getPageLayoutRects(): HighlightRect[] {
  if (typeof window === "undefined") return [];

  const preop = getRectFromSelector('[data-guide="preop-info"]');
  const annotation = getRectFromSelector('[data-guide="annotation-tasks"]');
  const visualization = getRectFromSelector('[data-guide="visualization-panel"]');
  const submit = getRectFromSelector('[data-guide="submit-area"]');

  const rects: HighlightRect[] = [];

  if (submit) {
    rects.push({
      label: "Submit / Next / Home",
      ...submit,
    });
  }

  if (preop) {
    rects.push({
      label: "Pre-operative information",
      ...preop,
    });
  }

  if (annotation) {
    rects.push({
      label: "Annotation tasks",
      ...annotation,
    });
  }

  if (visualization) {
    rects.push({
      label: "Visualization panel",
      ...visualization,
    });
  }

  return rects;
}

function getVisualizationPanelElement() {
  return getTargetElement('[data-guide="visualization-panel"]');
}

function findTimelineScrollBarRect(panel: Element): HighlightRect | null {
  const timelineRect =
    findSectionRectFromHeader(
      panel,
      ["Timeline and Events", "Timeline"],
      ["Gas", "Medications"]
    ) ?? getRectFromElement(panel);

  const allElements = Array.from(panel.querySelectorAll("*"));

  const candidateRects = allElements
    .map(getRectFromElement)
    .filter((rect) => {
      const insideTimeline =
        rect.top >= timelineRect.top &&
        rect.top <= timelineRect.top + timelineRect.height &&
        rect.left >= timelineRect.left &&
        rect.left <= timelineRect.left + timelineRect.width;

      const looksLikeHorizontalBar =
        rect.width > timelineRect.width * 0.35 &&
        rect.height >= 4 &&
        rect.height <= 32;

      const inLowerHalf =
        rect.top > timelineRect.top + timelineRect.height * 0.42;

      return insideTimeline && looksLikeHorizontalBar && inLowerHalf;
    })
    .sort((a, b) => {
      const aScore = a.width - Math.abs(a.height - 10) * 20;
      const bScore = b.width - Math.abs(b.height - 10) * 20;
      return bScore - aScore;
    });

  return candidateRects[0] ? getVisibleRect(candidateRects[0]) : null;
}

function findResolutionControlRect(panel: Element): HighlightRect | null {
  const panelRect = getRectFromElement(panel);
  const allElements = Array.from(panel.querySelectorAll("button, div, span"));

  const candidates = allElements
    .filter((el) => {
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      return text.includes("15 min") && text.includes("5 min");
    })
    .map(getRectFromElement)
    .filter((rect) => {
      const insidePanel =
        rect.left >= panelRect.left &&
        rect.left <= panelRect.left + panelRect.width &&
        rect.top >= panelRect.top &&
        rect.top <= panelRect.top + panelRect.height;

      const reasonableSize =
        rect.width >= 80 &&
        rect.width <= 260 &&
        rect.height >= 24 &&
        rect.height <= 80;

      return insidePanel && reasonableSize;
    })
    .sort((a, b) => {
      const aTopScore = Math.abs(a.top - (panelRect.top + 60));
      const bTopScore = Math.abs(b.top - (panelRect.top + 60));
      return aTopScore - bTopScore;
    });

  if (candidates[0]) return getVisibleRect(candidates[0]);

  const buttonCandidates = allElements
    .filter((el) => elementTextIncludes(el, ["15 min", "5 min"]))
    .map(getRectFromElement)
    .filter((rect) => {
      return (
        rect.left >= panelRect.left &&
        rect.left <= panelRect.left + panelRect.width &&
        rect.top >= panelRect.top &&
        rect.top <= panelRect.top + panelRect.height &&
        rect.width >= 40 &&
        rect.height >= 20
      );
    });

  if (!buttonCandidates.length) return null;

  const left = Math.min(...buttonCandidates.map((r) => r.left));
  const top = Math.min(...buttonCandidates.map((r) => r.top));
  const right = Math.max(...buttonCandidates.map((r) => r.left + r.width));
  const bottom = Math.max(...buttonCandidates.map((r) => r.top + r.height));

  return getVisibleRect({
    top,
    left,
    width: right - left,
    height: bottom - top,
  });
}
function findGasAndMedicationSectionRect(panel: Element): HighlightRect | null {
  const panelRect = getRectFromElement(panel);

  const gasRect =
    findSectionRectFromHeader(
      panel,
      ["▼ Gas", "▾ Gas", "Gas"],
      ["Medications", "Medication"]
    ) ??
    getVisibleRect({
      top: panelRect.top + panelRect.height * 0.24,
      left: panelRect.left,
      width: panelRect.width,
      height: Math.max(170, panelRect.height * 0.28),
    });

  const medicationRect =
    findSectionRectFromHeader(
      panel,
      ["Medications", "Medication"],
      [
        "Vitals",
        "Vital",
        "Ventilation",
        "Temperature",
        "CV",
        "Fluid",
        "Fluids",
      ]
    ) ??
    getVisibleRect({
      top: panelRect.top + panelRect.height * 0.45,
      left: panelRect.left,
      width: panelRect.width,
      height: Math.max(180, panelRect.height * 0.32),
    });

  if (!gasRect && !medicationRect) return null;
  if (!gasRect) return medicationRect;
  if (!medicationRect) return gasRect;

  const top = Math.min(gasRect.top, medicationRect.top);
  const left = Math.min(gasRect.left, medicationRect.left);
  const right = Math.max(
    gasRect.left + gasRect.width,
    medicationRect.left + medicationRect.width
  );
  const bottom = Math.max(
    gasRect.top + gasRect.height,
    medicationRect.top + medicationRect.height
  );

  return getVisibleRect({
    top,
    left,
    width: right - left,
    height: bottom - top,
  });
}

function getVisualizationSubRect(mode?: GuideStep["highlightMode"]) {
  const panel = getVisualizationPanelElement();

  if (!panel) {
    return getRectFromSelector('[data-guide="visualization-panel"]');
  }

  const panelRect = getRectFromElement(panel);

  if (!mode || mode === "visualization-panel") {
    return getVisibleRect(panelRect);
  }

  if (
    mode === "annotation-abnormality-draw" ||
    mode === "annotation-abnormality-review" ||
    mode === "annotation-abnormality-adjust" ||
    mode === "annotation-abnormality-save"
  ) {
    return (
      findVitalsSectionRect(panel) ??
      getVisibleRect({
        top: panelRect.top + panelRect.height * 0.58,
        left: panelRect.left,
        width: panelRect.width,
        height: Math.max(320, panelRect.height * 0.42),
      })
    );
  }

  if (mode === "visualization-timeline") {
    return (
      findSectionRectFromHeader(
        panel,
        ["Timeline and Events", "Timeline"],
        ["Gas", "Medications"]
      ) ??
      getVisibleRect({
        top: panelRect.top + 60,
        left: panelRect.left,
        width: panelRect.width,
        height: Math.max(140, panelRect.height * 0.24),
      })
    );
  }

  if (mode === "visualization-resolution") {
    return (
      findResolutionControlRect(panel) ??
      getVisibleRect({
        top: panelRect.top + 58,
        left: panelRect.left + panelRect.width - 180,
        width: 160,
        height: 44,
      })
    );
  }

  if (mode === "visualization-time-scroll") {
    return (
      findSectionRectFromHeader(
        panel,
        ["Timeline and Events", "Timeline"],
        ["Gas", "Medications"]
      ) ??
      getVisibleRect({
        top: panelRect.top + 60,
        left: panelRect.left,
        width: panelRect.width,
        height: Math.max(140, panelRect.height * 0.24),
      })
    );
  }

  if (mode === "visualization-gas-overview" || mode === "visualization-gas") {
    return (
      findSectionRectFromHeader(
        panel,
        ["▼ Gas", "▾ Gas", "Gas"],
        ["Medications", "Medication"]
      ) ??
      getVisibleRect({
        top: panelRect.top + panelRect.height * 0.24,
        left: panelRect.left,
        width: panelRect.width,
        height: Math.max(170, panelRect.height * 0.28),
      })
    );
  }

  if (mode === "annotation-management-right-panel") {
    return (
      findGasAndMedicationSectionRect(panel) ??
      getVisibleRect({
        top: panelRect.top + panelRect.height * 0.24,
        left: panelRect.left,
        width: panelRect.width,
        height: Math.max(360, panelRect.height * 0.5),
      })
    );
  }

  if (
    mode === "visualization-medication-overview" ||
    mode === "visualization-medication"
  ) {
    return (
      findSectionRectFromHeader(
        panel,
        ["Medications", "Medication"],
        [
          "Vitals",
          "Vital",
          "Ventilation",
          "Temperature",
          "CV",
          "Fluid",
          "Fluids",
        ]
      ) ??
      getVisibleRect({
        top: panelRect.top + panelRect.height * 0.45,
        left: panelRect.left,
        width: panelRect.width,
        height: Math.max(180, panelRect.height * 0.32),
      })
    );
  }

  if (
    mode === "visualization-vitals-overview" ||
    mode === "visualization-vitals"
  ) {
    return (
      findVitalsSectionRect(panel) ??
      getVisibleRect({
        top: panelRect.top + panelRect.height * 0.58,
        left: panelRect.left,
        width: panelRect.width,
        height: Math.max(320, panelRect.height * 0.42),
      })
    );
  }

  if (
    mode === "visualization-ventilation-overview" ||
    mode === "visualization-ventilation"
  ) {
    return (
      findVentilationSectionRect(panel) ??
      getVisibleRect({
        top: panelRect.top + panelRect.height * 0.68,
        left: panelRect.left,
        width: panelRect.width,
        height: Math.max(260, panelRect.height * 0.3),
      })
    );
  }

  return getVisibleRect(panelRect);
}

function scrollVisualizationSectionIntoView(mode?: GuideStep["highlightMode"]) {
  const panel = getVisualizationPanelElement();

  if (!panel) return false;

  let headerKeywords: string[] | null = null;
  let block: ScrollLogicalPosition = "center";

  if (mode === "visualization-gas-overview" || mode === "visualization-gas") {
    headerKeywords = ["▼ Gas", "▾ Gas", "Gas"];
  }

  if (
    mode === "visualization-medication-overview" ||
    mode === "visualization-medication"
  ) {
    headerKeywords = ["Medications", "Medication"];
    block = "start";
  }

  if (mode === "annotation-management-right-panel") {
    headerKeywords = ["▼ Gas", "▾ Gas", "Gas"];
    block = "start";
  }

  if (
    mode === "visualization-vitals-overview" ||
    mode === "visualization-vitals" ||
    mode === "annotation-abnormality-draw" ||
    mode === "annotation-abnormality-review" ||
    mode === "annotation-abnormality-adjust" ||
    mode === "annotation-abnormality-save"
  ) {
    headerKeywords = ["▼ Vitals", "▾ Vitals", "Vitals"];
    block =
      mode === "annotation-abnormality-draw" ||
      mode === "annotation-abnormality-review" ||
      mode === "annotation-abnormality-adjust" ||
      mode === "annotation-abnormality-save"
        ? "start"
        : "center";
  }

  if (
    mode === "visualization-ventilation-overview" ||
    mode === "visualization-ventilation"
  ) {
    headerKeywords = ["▼ Ventilation", "▾ Ventilation", "Ventilation"];
    block = "start";
  }

  if (!headerKeywords) return false;

  const headerEl = findElementByText(panel, headerKeywords);

  if (!headerEl) return false;

  headerEl.scrollIntoView({
    behavior: "auto",
    block,
    inline: "nearest",
  });

  return true;
}

function ensureVentilationDetailVisible() {
  if (typeof window === "undefined") return false;

  const trajectoryRect = getVentilationTrajectoryRect();

  if (!trajectoryRect) return false;

  const bottomMargin = 28;
  const overflowBottom =
    trajectoryRect.top +
    trajectoryRect.height -
    (window.innerHeight - bottomMargin);

  if (overflowBottom <= 0) return false;

  window.scrollBy({
    top: overflowBottom + 24,
    behavior: "auto",
  });

  return true;
}

function getTimelineScrollNoteRect() {
  const panel = getVisualizationPanelElement();

  if (!panel) return null;

  const timelineRect =
    findSectionRectFromHeader(
      panel,
      ["Timeline and Events", "Timeline"],
      ["Gas", "Medications"]
    ) ?? getRectFromElement(panel);

  const barRect = findTimelineScrollBarRect(panel);

  if (!barRect) {
    return {
      top: timelineRect.top + timelineRect.height - 36,
      left: timelineRect.left + 260,
      width: 430,
      height: 34,
    };
  }

  return {
    top: barRect.top + barRect.height + 8,
    left: Math.max(timelineRect.left + 260, barRect.left + 12),
    width: 430,
    height: 34,
  };
}

function getResolutionNoteRect() {
  const panel = getVisualizationPanelElement();

  if (!panel) return null;

  const rect =
    findResolutionControlRect(panel) ??
    getVisualizationSubRect("visualization-resolution");

  if (!rect) return null;

  return {
    top: rect.top + rect.height + 8,
    left: Math.max(8, rect.left - 220),
    width: Math.min(520, rect.width + 260),
    height: 32,
  };
}

function getGasColorColumnRect() {
  const gasRect = getVisualizationSubRect("visualization-gas");

  if (!gasRect) return null;

  return {
    top: gasRect.top + 44,
    left: gasRect.left + 198,
    width: 38,
    height: 142,
  };
}

function getGasLabelNoteRect() {
  const colorRect = getGasColorColumnRect();

  if (!colorRect) return null;

  return {
    top: colorRect.top + 4,
    left: colorRect.left + colorRect.width + 12,
    width: 520,
    height: 38,
  };
}

function getGasValueNoteRect() {
  const gasRect = getVisualizationSubRect("visualization-gas");

  if (!gasRect) return null;

  return {
    top: gasRect.top + 86,
    left: gasRect.left + gasRect.width * 0.34,
    width: 560,
    height: 38,
  };
}

function getGasTrajectoryTooltipRect() {
  const gasRect = getVisualizationSubRect("visualization-gas");

  if (!gasRect) return null;

  return {
    top: gasRect.top + 150,
    left: gasRect.left + gasRect.width * 0.36,
    width: 520,
    height: 230,
  };
}

function getMedicationColorSquareRect() {
  const medicationRect = getVisualizationSubRect("visualization-medication");

  if (!medicationRect) return null;

  return {
    top: medicationRect.top + 46,
    left: medicationRect.left + 205,
    width: 34,
    height: 278,
  };
}

function getMedicationLabelNoteRect() {
  const colorRect = getMedicationColorSquareRect();

  if (!colorRect) return null;

  return {
    top: colorRect.top + 6,
    left: colorRect.left + colorRect.width + 10,
    width: 520,
    height: 42,
  };
}

function getMedicationEventNoteRect() {
  const medicationRect = getVisualizationSubRect("visualization-medication");

  if (!medicationRect) return null;

  return {
    top: medicationRect.top + 116,
    left: medicationRect.left + medicationRect.width * 0.38,
    width: 650,
    height: 42,
  };
}

function getMedicationTooltipRect() {
  const medicationRect = getVisualizationSubRect("visualization-medication");

  if (!medicationRect) return null;

  return {
    top: medicationRect.top + 150,
    left: medicationRect.left + medicationRect.width * 0.48,
    width: 190,
    height: 92,
  };
}

function getVitalsColorColumnRect() {
  const vitalsRect = getVisualizationSubRect("visualization-vitals");

  if (!vitalsRect) return null;

  return {
    top: vitalsRect.top + 78,
    left: vitalsRect.left + 172,
    width: 62,
    height: Math.max(210, Math.min(290, vitalsRect.height - 110)),
  };
}

function getVitalsLabelNoteRect() {
  const colorRect = getVitalsColorColumnRect();

  if (!colorRect) return null;

  return {
    top: colorRect.top + 8,
    left: colorRect.left + colorRect.width + 12,
    width: 690,
    height: 46,
  };
}

function getVentilationSegmentNoteRect() {
  const ventilationRect = getVisualizationSubRect("visualization-ventilation");

  if (!ventilationRect) return null;

  return {
    top: ventilationRect.top + 88,
    left: ventilationRect.left + ventilationRect.width * 0.34,
    width: 660,
    height: 42,
  };
}

function getVentilationTrajectoryRect() {
  const ventilationRect = getVisualizationSubRect("visualization-ventilation");

  if (!ventilationRect) return null;

  return {
    top: ventilationRect.top + ventilationRect.height + 14,
    left: ventilationRect.left + 34,
    width: Math.min(760, ventilationRect.width - 68),
    height: 230,
  };
}

function isAbnormalityGuideMode(mode?: GuideStep["highlightMode"]) {
  return (
    mode === "annotation-abnormality-draw" ||
    mode === "annotation-abnormality-review" ||
    mode === "annotation-abnormality-adjust" ||
    mode === "annotation-abnormality-save"
  );
}

function getAbnormalityWorkflowRect(): HighlightRect | null {
  const annotationRect = getRectFromSelector('[data-guide="annotation-tasks"]');
  const vitalsRect = getVisualizationSubRect("annotation-abnormality-draw");

  if (!annotationRect && !vitalsRect) return null;
  if (!annotationRect) return vitalsRect;
  if (!vitalsRect) return annotationRect;

  const top = Math.min(annotationRect.top, vitalsRect.top);
  const left = Math.min(annotationRect.left, vitalsRect.left);
  const right = Math.max(
    annotationRect.left + annotationRect.width,
    vitalsRect.left + vitalsRect.width
  );
  const bottom = Math.max(
    annotationRect.top + annotationRect.height,
    vitalsRect.top + vitalsRect.height
  );

  return getVisibleRect({
    top,
    left,
    width: right - left,
    height: bottom - top,
  });
}

function getCurrentAbnormalityBoxRect(
  mode?: GuideStep["highlightMode"]
): HighlightRect | null {
  const vitalsRect = getVisualizationSubRect("annotation-abnormality-draw");

  if (!vitalsRect) return null;

  if (mode === "annotation-abnormality-draw") {
    return {
      top: vitalsRect.top + vitalsRect.height * 0.34,
      left: vitalsRect.left + vitalsRect.width * 0.38,
      width: vitalsRect.width * 0.13,
      height: vitalsRect.height * 0.18,
    };
  }

  if (mode === "annotation-abnormality-review") {
    return {
      top: vitalsRect.top + vitalsRect.height * 0.25,
      left: vitalsRect.left + vitalsRect.width * 0.52,
      width: vitalsRect.width * 0.16,
      height: vitalsRect.height * 0.36,
    };
  }

  if (mode === "annotation-abnormality-adjust") {
    return {
      top: vitalsRect.top + vitalsRect.height * 0.25,
      left: vitalsRect.left + vitalsRect.width * 0.50,
      width: vitalsRect.width * 0.19,
      height: vitalsRect.height * 0.36,
    };
  }

  if (mode === "annotation-abnormality-save") {
    return {
      top: vitalsRect.top + vitalsRect.height * 0.25,
      left: vitalsRect.left + vitalsRect.width * 0.52,
      width: vitalsRect.width * 0.16,
      height: vitalsRect.height * 0.36,
    };
  }

  return null;
}

function getCurrentAbnormalityBackgroundRect(
  mode?: GuideStep["highlightMode"]
): HighlightRect | null {
  const vitalsRect = getVisualizationSubRect("annotation-abnormality-draw");
  const boxRect = getCurrentAbnormalityBoxRect(mode);

  if (!vitalsRect || !boxRect) return null;

  return {
    top: vitalsRect.top + 36,
    left: boxRect.left,
    width: boxRect.width,
    height: Math.max(180, vitalsRect.height - 74),
  };
}

function getChecklistOverlayRect(): HighlightRect | null {
  const panelRect = getRectFromSelector('[data-guide="annotation-tasks"]');

  if (!panelRect) return null;

  return getVisibleRect({
    top: panelRect.top + 230,
    left: panelRect.left + 18,
    width: panelRect.width - 36,
    height: Math.min(310, Math.max(230, panelRect.height - 250)),
  });
}

function getAnnotationSubRect(mode?: GuideStep["highlightMode"]) {
  const panel = getTargetElement('[data-guide="annotation-tasks"]');

  if (!panel) {
    return getRectFromSelector('[data-guide="annotation-tasks"]');
  }

  const panelRect = getRectFromElement(panel);

  if (!mode || mode === "annotation-panel") {
    return getVisibleRect(panelRect);
  }

  if (mode === "annotation-tabs") {
    const tabRect =
      getRectFromSelector('[data-guide="task-tabs"]') ??
      getVisibleRect({
        top: panelRect.top + 30,
        left: panelRect.left + 16,
        width: Math.min(560, panelRect.width - 32),
        height: 56,
      });

    return getVisibleRect({
      top: tabRect.top - 8,
      left: tabRect.left - 8,
      width: tabRect.width + 16,
      height: tabRect.height + 46,
    });
  }

  if (mode === "annotation-instructions") {
    return getVisibleRect({
      top: panelRect.top + 120,
      left: panelRect.left + 16,
      width: panelRect.width - 32,
      height: 190,
    });
  }

  if (mode === "annotation-text") {
    return getVisibleRect({
      top: panelRect.top + 320,
      left: panelRect.left + 16,
      width: panelRect.width - 32,
      height: Math.max(220, panelRect.height * 0.38),
    });
  }

  if (mode === "annotation-voice") {
    return getVisibleRect({
      top: panelRect.top + panelRect.height - 94,
      left: panelRect.left + 16,
      width: Math.min(560, panelRect.width - 32),
      height: 82,
    });
  }

  if (mode === "annotation-save") {
    return getVisibleRect({
      top: panelRect.top + panelRect.height - 94,
      left: panelRect.left + panelRect.width - 190,
      width: 174,
      height: 82,
    });
  }

  if (mode === "annotation-abnormality") {
    return getVisibleRect({
      top: panelRect.top,
      left: panelRect.left,
      width: panelRect.width,
      height: Math.max(360, Math.min(panelRect.height, 520)),
    });
  }

  if (mode === "annotation-management") {
    return getVisibleRect({
      top: panelRect.top,
      left: panelRect.left,
      width: panelRect.width,
      height: Math.max(420, Math.min(panelRect.height, 620)),
    });
  }

  if (mode === "annotation-management-instructions") {
    return getVisibleRect({
      top: panelRect.top + 120,
      left: panelRect.left + 24,
      width: panelRect.width - 48,
      height: 190,
    });
  }

  if (mode === "annotation-management-focused-event") {
    return getVisibleRect({
      top: panelRect.top + 330,
      left: panelRect.left + 24,
      width: panelRect.width - 48,
      height: 190,
    });
  }

  if (mode === "annotation-management-text") {
    return getVisibleRect({
      top: panelRect.top + 535,
      left: panelRect.left + 24,
      width: panelRect.width - 48,
      height: 150,
    });
  }

  if (mode === "annotation-management-save") {
    return getVisibleRect({
      top: panelRect.top + panelRect.height - 96,
      left: panelRect.left + panelRect.width - 210,
      width: 190,
      height: 82,
    });
  }

  return getVisibleRect(panelRect);
}

function getPreopRect() {
  const rect = getRectFromSelector('[data-guide="preop-info"]');
  if (!rect) return null;

  return getVisibleRect({
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: Math.max(80, Math.min(rect.height, 120)),
  });
}

function getSubmitRect() {
  const rect = getRectFromSelector('[data-guide="submit-area"]');
  return rect ? getVisibleRect(rect) : null;
}

function getTargetRectByStep(step: GuideStep): HighlightRect | null {
  if (step.highlightMode === "preop") {
    return getPreopRect();
  }

  if (
    step.highlightMode === "annotation-panel" ||
    step.highlightMode === "annotation-tabs" ||
    step.highlightMode === "annotation-instructions" ||
    step.highlightMode === "annotation-text" ||
    step.highlightMode === "annotation-voice" ||
    step.highlightMode === "annotation-save" ||
    step.highlightMode === "annotation-abnormality" ||
    step.highlightMode === "annotation-management" ||
    step.highlightMode === "annotation-management-instructions" ||
    step.highlightMode === "annotation-management-focused-event" ||
    step.highlightMode === "annotation-management-text" ||
    step.highlightMode === "annotation-management-save"
  ) {
    return getAnnotationSubRect(step.highlightMode);
  }
  if (isAbnormalityGuideMode(step.highlightMode)) {
    return getAbnormalityWorkflowRect();
  }

  if (
    step.highlightMode === "visualization-panel" ||
    step.highlightMode === "visualization-timeline" ||
    step.highlightMode === "visualization-resolution" ||
    step.highlightMode === "visualization-time-scroll" ||
    step.highlightMode === "visualization-gas-overview" ||
    step.highlightMode === "visualization-gas" ||
    step.highlightMode === "visualization-medication-overview" ||
    step.highlightMode === "visualization-medication" ||
    step.highlightMode === "visualization-vitals-overview" ||
    step.highlightMode === "visualization-vitals" ||
    step.highlightMode === "visualization-ventilation-overview" ||
    step.highlightMode === "visualization-ventilation" ||
    step.highlightMode === "annotation-management-right-panel"
  ) {
    return getVisualizationSubRect(step.highlightMode);
  }

  if (step.highlightMode === "submit") {
    return getSubmitRect();
  }

  return getRectFromSelector(step.selector);
}

function clampCardPosition(position: { top: number; left: number }) {
  if (typeof window === "undefined") return position;

  const cardWidth = 720;
  const margin = 16;

  return {
    top: Math.max(margin, Math.min(position.top, window.innerHeight - 120)),
    left: Math.max(
      margin,
      Math.min(position.left, window.innerWidth - cardWidth - margin)
    ),
  };
}

function getInitialCardPosition(placement: "left" | "right" | "center") {
  if (typeof window === "undefined") {
    return { top: 80, left: 80 };
  }

  const width = 720;

  if (placement === "left") {
    return {
      top: 72,
      left: 24,
    };
  }

  if (placement === "center") {
    return {
      top: 72,
      left: Math.max(24, Math.floor((window.innerWidth - width) / 2)),
    };
  }

  return {
    top: 72,
    left: Math.max(24, window.innerWidth - width - 24),
  };
}

function getCompactCardPosition() {
  if (typeof window === "undefined") {
    return { top: 420, left: 24 };
  }

  return {
    top: Math.max(24, window.innerHeight - 260),
    left: 24,
  };
}

function LayoutPreview() {
  return (
    <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-blue-950">
          Case title
        </div>

        <div className="rounded-lg border border-blue-300 bg-blue-100 px-3 py-2 text-xs font-semibold text-blue-950">
          Submit / Next / Home
        </div>

        <div className="col-span-2 rounded-lg border border-blue-300 bg-white px-3 py-3">
          <div className="text-xs font-semibold text-blue-950">
            Pre-operative information
          </div>
        </div>

        <div className="rounded-lg border border-blue-300 bg-blue-100 px-3 py-3">
          <div className="text-xs font-semibold text-blue-950">
            Annotation tasks
          </div>
        </div>

        <div className="rounded-lg border border-blue-300 bg-blue-100 px-3 py-3">
          <div className="text-xs font-semibold text-blue-950">
            Visualization panel
          </div>
        </div>
      </div>
    </div>
  );
}

function PreopPreview() {
  return (
    <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
      <div className="mb-3 text-sm font-semibold text-blue-950">
        Pre-operative information demo
      </div>

      <div className="rounded-xl border border-blue-300 bg-white p-3">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-blue-950">
          <span>▾</span>
          <span>Patient Pre-operative Information</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-blue-900">
          <div className="rounded-md bg-blue-50 px-2 py-2">
            <span className="font-semibold">Patient:</span> age, sex, BMI
          </div>

          <div className="rounded-md bg-blue-50 px-2 py-2">
            <span className="font-semibold">Surgery:</span> procedure, diagnosis
          </div>

          <div className="rounded-md bg-blue-50 px-2 py-2">
            <span className="font-semibold">Airway:</span> ASA, Mallampati, NPO
          </div>

          <div className="rounded-md bg-blue-50 px-2 py-2">
            <span className="font-semibold">Labs:</span> electrolytes, CBC, ABG
          </div>
        </div>
      </div>
    </div>
  );
}

function AnnotationPreview({
  mode,
}: {
  mode: NonNullable<GuideStep["annotationPreview"]>["mode"];
}) {
  const highlightClass = "ring-2 ring-orange-400 bg-orange-50";

  if (mode === "abnormality") {
    return (
      <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
        <div className="rounded-xl border border-emerald-300 bg-white p-3">
          <div className={`mb-3 rounded-lg p-2 ${highlightClass}`}>
            <div className="mb-2 flex flex-wrap gap-2">
              <span className="rounded-full border bg-white px-3 py-1 text-xs font-semibold text-gray-700">
                Summary
              </span>
              <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                Abnormality Reasoning
              </span>
              <span className="rounded-full border bg-white px-3 py-1 text-xs font-semibold text-gray-700">
                Management Reasoning
              </span>
            </div>

            <div className="text-xs font-bold text-red-600">
              Task 2: Detect all abnormalities and annotate one before moving to
              the next step.
            </div>
          </div>

          <div className="mb-3 space-y-2">
            <div className="rounded-md bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-950">
              ▸ Annotation Instructions
            </div>
            <div className="rounded-md bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-950">
              ▸ FAQ / Common Questions
            </div>
          </div>

          <div className="mb-3 rounded-lg border bg-white p-3">
            <div className="mb-3 text-sm font-bold text-gray-900">Checklist</div>
            <div className="mb-3 inline-flex rounded-lg border border-dashed px-4 py-3 text-xs text-gray-500">
              No events yet.
            </div>
            <div className="border-t pt-3 text-xs text-gray-700">
              <span className="mr-5">Detected episodes: 0</span>
              <span>Selected for reasoning: 0</span>
            </div>
          </div>

          <div className="flex gap-2">
            <span className="rounded-md border bg-white px-3 py-2 text-xs font-semibold text-gray-700">
              Reset All
            </span>
            <span className="rounded-md bg-blue-500 px-3 py-2 text-xs font-semibold text-white">
              Save button
            </span>
          </div>
        </div>
      </div>
    );
  }


  if (mode === "management") {
    return (
      <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
        <div className="rounded-xl border border-emerald-300 bg-white p-3">
          <div className={`mb-3 rounded-lg p-2 ${highlightClass}`}>
            <div className="mb-2 flex flex-wrap gap-2">
              <span className="rounded-full border bg-white px-3 py-1 text-xs font-semibold text-gray-700">
                Summary
              </span>
              <span className="rounded-full border bg-white px-3 py-1 text-xs font-semibold text-gray-700">
                Abnormality Reasoning
              </span>
              <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                Management Reasoning
              </span>
            </div>

            <div className="text-xs font-bold text-gray-900">
              Task 3: Reasoning on a given medication/gas event on the right
              medication/gas event panel
            </div>
          </div>

          <div className="mb-3 space-y-2">
            <div className="rounded-md bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-950">
              ▸ Annotation Instructions
            </div>
            <div className="rounded-md bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-950">
              ▸ Example
            </div>
            <div className="rounded-md bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-950">
              ▸ FAQ / Common Questions
            </div>
          </div>

          <div className="mb-3 rounded-xl border bg-white p-4">
            <div className="mb-3 text-sm font-bold text-gray-900">
              Focused medication event
            </div>
            <div className="space-y-2 text-xs text-gray-700">
              <div>
                <span className="font-semibold">Medication:</span> propofol
              </div>
              <div>
                <span className="font-semibold">Time:</span> 10:42:00
              </div>
              <div>
                <span className="font-semibold">Type:</span>{" "}
                infusion_adjustment
              </div>
              <div>
                <span className="font-semibold">Change:</span> 60 mcg/kg/min
                -&gt; 25 mcg/kg/min
              </div>
            </div>
          </div>

          <div className="mb-3 rounded-lg border bg-white p-3">
            <div className="min-h-[80px] text-xs text-gray-500">
              Write or dictate your management reasoning here...
            </div>
          </div>

          <div className="inline-flex rounded-md bg-blue-500 px-3 py-2 text-xs font-semibold text-white">
            Save
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
      <div className="mb-3 text-sm font-semibold text-emerald-950">
        Annotation workflow demo
      </div>

      <div className="rounded-xl border border-emerald-300 bg-white p-3">
        <div
          className={`mb-3 flex flex-wrap gap-2 rounded-lg p-2 ${
            ["tabs", "switch"].includes(mode) ? highlightClass : ""
          }`}
        >
          <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
            Summary
          </span>

          <span className="rounded-full border bg-white px-3 py-1 text-xs font-semibold text-gray-700">
            Abnormality Reasoning
          </span>

          <span className="rounded-full border bg-white px-3 py-1 text-xs font-semibold text-gray-700">
            Management Reasoning
          </span>

          {mode === "tabs" && (
            <div className="basis-full pt-1 text-xs font-bold text-red-600">
              Three tasks need to be finished. Click the buttons to switch tasks.
            </div>
          )}

          {mode === "switch" && (
            <div className="basis-full pt-1 text-xs font-bold text-red-600">
              Once you finish one task, switch to another unfinished task.
            </div>
          )}
        </div>

        {mode === "panel" && (
          <div className="mb-3 rounded-lg bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">
            This is where you read instructions, write answers, use voice input,
            and save each task.
          </div>
        )}

        <div
          className={`mb-3 space-y-2 rounded-lg p-2 ${
            mode === "instructions" ? highlightClass : ""
          }`}
        >
          <div className="rounded-md bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-950">
            ▸ Annotation Instructions
          </div>

          <div className="rounded-md bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-950">
            ▸ Example
          </div>

          <div className="rounded-md bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-950">
            ▸ FAQ / Common Questions
          </div>

          {mode === "instructions" && (
            <div className="text-xs font-bold text-red-600">
              Click it to read the full description, or click again to collapse
              it.
            </div>
          )}
        </div>

        <div
          className={`mb-3 rounded-lg border p-3 ${
            mode === "text" ? highlightClass : "bg-white"
          }`}
        >
          <div className="min-h-[92px] text-xs leading-5 text-gray-600">
            {mode === "text"
              ? "The patient had stable hemodynamics for most of the case, with a short period of hypotension after induction..."
              : "Write your response in the text box."}
          </div>

          {mode === "text" && (
            <div className="mt-2 text-xs font-bold text-red-600">
              Record or type here.
            </div>
          )}
        </div>

        <div
          className={`mb-3 rounded-lg p-2 ${
            mode === "voice" ? highlightClass : ""
          }`}
        >
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-gray-700">
              Speech language:
            </span>

            <span className="rounded-md border bg-white px-2 py-1">
              English ▾
            </span>

            {mode === "voice" && (
              <span className="rounded-md border border-blue-300 bg-blue-50 px-2 py-1 font-semibold text-blue-700">
                English / Chinese / Hindi / Bengali
              </span>
            )}

            <span className="rounded-md bg-orange-500 px-3 py-1 font-semibold text-white">
              Start Recording
            </span>
          </div>

          {mode === "voice" && (
            <div className="mt-2 text-xs font-bold text-red-600">
              Choose a language, click Start Recording, and click Stop Recording
              when finished.
            </div>
          )}
        </div>

        <div
          className={`inline-flex rounded-lg p-2 ${
            mode === "save" ? highlightClass : ""
          }`}
        >
          <span className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white">
            Save and Next
          </span>
        </div>

        {mode === "save" && (
          <div className="mt-2 text-xs font-bold text-red-600">
            You must save before moving to the next task.
          </div>
        )}
      </div>
    </div>
  );
}

function WorkflowNav({
  currentStep,
  onJump,
}: {
  currentStep: GuideStep;
  onJump: (group: NavGroup) => void;
}) {
  const workflowGroups: Array<{ key: NavGroup; label: string }> = [
    { key: "layout", label: "Layout" },
    { key: "preop", label: "Pre-op info" },
    { key: "visualization", label: "Visualization" },
    { key: "annotation", label: "Annotation task" },
    { key: "submit", label: "Submit" },
  ];

  return (
    <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-700">
        Workflow
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {workflowGroups.map((group, index) => {
          const active = group.key === currentStep.navGroup;
          const currentGroupIndex = workflowGroups.findIndex(
            (item) => item.key === currentStep.navGroup
          );
          const completed = index < currentGroupIndex;

          return (
            <div key={group.key} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onJump(group.key)}
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  active
                    ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                    : completed
                      ? "border-blue-200 bg-white text-blue-700"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {index + 1}. {group.label}
              </button>

              {index < workflowGroups.length - 1 && (
                <span className="text-sm font-bold text-blue-400">→</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getFirstStepIndexForGroup(group: NavGroup) {
  const index = GUIDE_STEPS.findIndex((step) => step.navGroup === group);
  return index >= 0 ? index : 0;
}

export default function UserGuideOverlay({
  open,
  onClose,
}: UserGuideOverlayProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<HighlightRect | null>(null);
  const [layoutRects, setLayoutRects] = useState<HighlightRect[]>([]);
  const [cardPosition, setCardPosition] = useState({ top: 72, left: 24 });
  const [hasDragged, setHasDragged] = useState(false);

  const dragStateRef = useRef<{
    dragging: boolean;
    offsetX: number;
    offsetY: number;
  }>({
    dragging: false,
    offsetX: 0,
    offsetY: 0,
  });

  const currentStep = GUIDE_STEPS[stepIndex];
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === GUIDE_STEPS.length - 1;
  const currentStepCardPlacement = currentStep.cardPlacement ?? "right";
  const isCompactCard = currentStep.compactCard === true;

  const compactCardPosition = getCompactCardPosition();

  const progressText = useMemo(() => {
    const groupIndex =
      NAV_GROUPS.findIndex((group) => group.key === currentStep.navGroup) + 1;
    return `${groupIndex} / ${NAV_GROUPS.length}`;
  }, [currentStep.navGroup]);

  useEffect(() => {
    setHasDragged(false);
  }, [stepIndex]);

  useEffect(() => {
    if (!open) return;
    if (!currentStep.realAnnotationTask) return;

    const timeout = window.setTimeout(() => {
      clickAnnotationTaskTab(currentStep.realAnnotationTask!);
    }, 80);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [open, stepIndex, currentStep.realAnnotationTask]);

  useEffect(() => {
    if (!open) return;

    const needsExtraBottomSpace =
      currentStep.highlightMode === "visualization-ventilation";

    if (!needsExtraBottomSpace) return;

    const originalPaddingBottom = document.body.style.paddingBottom;

    document.body.style.paddingBottom = "360px";

    return () => {
      document.body.style.paddingBottom = originalPaddingBottom;
    };
  }, [open, currentStep.highlightMode]);

  useEffect(() => {
    if (!open) return;
    if (hasDragged) return;
  
    if (currentStep.compactCard === true) {
      return;
    }
  
    const placement =
      currentStep.navGroup === "visualization"
        ? "left"
        : currentStepCardPlacement;
  
    setCardPosition(clampCardPosition(getInitialCardPosition(placement)));
  }, [
    open,
    stepIndex,
    currentStep.navGroup,
    currentStepCardPlacement,
    hasDragged,
    currentStep.compactCard,
  ]);
  useEffect(() => {
    if (!open) return;

    let timeout1: number | null = null;
    let timeout2: number | null = null;
    let timeout3: number | null = null;
    let timeout4: number | null = null;

    function updateTarget() {
      if (currentStep.realAnnotationTask) {
        clickAnnotationTaskTab(currentStep.realAnnotationTask);
      }

      if (currentStep.highlightMode === "layout") {
        const dashboard = getTargetElement(currentStep.selector);

        if (dashboard) {
          dashboard.scrollIntoView({
            behavior: "auto",
            block: "start",
            inline: "center",
          });
        }

        timeout1 = window.setTimeout(() => {
          setTargetRect(null);
          setLayoutRects(getPageLayoutRects());
        }, 180);

        return;
      }

      setLayoutRects([]);

      const el = getTargetElement(currentStep.selector);

      if (el) {
        const scrolledToSection = scrollVisualizationSectionIntoView(
          currentStep.highlightMode
        );

        if (!scrolledToSection) {
         
          const block =
          currentStep.navGroup === "visualization" ||
          isAbnormalityGuideMode(currentStep.highlightMode)
            ? "start"
            : "center";
          el.scrollIntoView({
            behavior: "auto",
            block,
            inline: "nearest",
          });
        }
      }

      timeout1 = window.setTimeout(() => {
        if (currentStep.realAnnotationTask) {
          clickAnnotationTaskTab(currentStep.realAnnotationTask);
        }

        const rect = getTargetRectByStep(currentStep);
        setTargetRect(rect);

        timeout4 = window.setTimeout(() => {
          const updatedRect = getTargetRectByStep(currentStep);
          setTargetRect(updatedRect);
        }, 160);

        if (currentStep.highlightMode === "visualization-ventilation") {
          const didScroll = ensureVentilationDetailVisible();

          if (didScroll) {
            timeout2 = window.setTimeout(() => {
              const updatedRect = getTargetRectByStep(currentStep);
              setTargetRect(updatedRect);

              timeout3 = window.setTimeout(() => {
                const finalRect = getTargetRectByStep(currentStep);
                setTargetRect(finalRect);
              }, 80);
            }, 80);
          }
        }
      }, 120);
    }

    updateTarget();

    window.addEventListener("resize", updateTarget);

    return () => {
      if (timeout1) window.clearTimeout(timeout1);
      if (timeout2) window.clearTimeout(timeout2);
      if (timeout3) window.clearTimeout(timeout3);
      if (timeout4) window.clearTimeout(timeout4);
      window.removeEventListener("resize", updateTarget);
    };
  }, [
    open,
    stepIndex,
    currentStep.id,
    currentStep.selector,
    currentStep.highlightMode,
    currentStep.navGroup,
    currentStep.realAnnotationTask,
  ]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }

      if (e.key === "ArrowRight") {
        setStepIndex((prev) => Math.min(prev + 1, GUIDE_STEPS.length - 1));
      }

      if (e.key === "ArrowLeft") {
        setStepIndex((prev) => Math.max(prev - 1, 0));
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setStepIndex(0);
      setTargetRect(null);
      setLayoutRects([]);
      setHasDragged(false);
    }
  }, [open]);

 
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!dragStateRef.current.dragging) return;
      if (currentStep.compactCard === true) return;
  
      setHasDragged(true);
      setCardPosition(
        clampCardPosition({
          top: e.clientY - dragStateRef.current.offsetY,
          left: e.clientX - dragStateRef.current.offsetX,
        })
      );
    }
  
    function handleMouseUp() {
      dragStateRef.current.dragging = false;
    }
  
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [currentStep.compactCard]);
  if (!open) return null;

  const highlightPadding = 8;

  const singleHighlightStyle =
    targetRect != null
      ? {
          top: Math.max(8, targetRect.top - highlightPadding),
          left: Math.max(8, targetRect.left - highlightPadding),
          width: Math.max(120, targetRect.width + highlightPadding * 2),
          height: Math.max(56, targetRect.height + highlightPadding * 2),
        }
      : {
          top: 120,
          left: 120,
          width: 420,
          height: 260,
        };

  const belowNoteStyle =
    targetRect != null
      ? {
          top: Math.max(
            8,
            targetRect.top + targetRect.height + highlightPadding + 4
          ),
          left: Math.max(8, targetRect.left),
          width: Math.max(260, Math.min(targetRect.width, 620)),
        }
      : null;

  const cardTop = isCompactCard ? compactCardPosition.top : cardPosition.top;
  const cardLeft = isCompactCard ? compactCardPosition.left : cardPosition.left;

  return (
    <div className="fixed inset-0 z-[9999]">
      <div className="absolute inset-0 bg-slate-950/35" />

      {currentStep.highlightMode === "layout" && layoutRects.length > 0 ? (
        layoutRects.map((rect, index) => {
          const style = {
            top: Math.max(8, rect.top - highlightPadding),
            left: Math.max(8, rect.left - highlightPadding),
            width: Math.max(160, rect.width + highlightPadding * 2),
            height: Math.max(56, rect.height + highlightPadding * 2),
          };

          return (
            <div
              key={`${rect.label ?? "layout"}-${index}`}
              className="absolute rounded-2xl border-4 border-orange-400 bg-orange-50/10 shadow-lg transition-all duration-200"
              style={style}
            >
              {rect.label && (
                <div className="absolute left-3 top-2 rounded-md bg-orange-400 px-2 py-1 text-xs font-bold text-white shadow">
                  {rect.label}
                </div>
              )}
            </div>
          );
        })
      ) : (
        <div
          className="absolute rounded-2xl border-4 border-orange-400 bg-orange-50/10 shadow-[0_0_0_9999px_rgba(15,23,42,0.35)] transition-all duration-200"
          style={singleHighlightStyle}
        >
          {currentStep.screenNote &&
            currentStep.screenNote.placement === "inside-top" && (
              <div className="absolute left-4 right-4 top-2 rounded-md bg-white/90 px-3 py-1 text-sm font-bold text-red-600 shadow-sm">
                {currentStep.screenNote.text}
              </div>
            )}

          {currentStep.screenNote &&
            currentStep.screenNote.placement === "inside-bottom" && (
              <div className="absolute bottom-2 left-4 right-4 rounded-md bg-white/90 px-3 py-1 text-sm font-bold text-red-600 shadow-sm">
                {currentStep.screenNote.text}
              </div>
            )}
        </div>
      )}

      {currentStep.screenNote &&
        currentStep.screenNote.placement === "below" &&
        belowNoteStyle && (
          <div
            className="absolute z-[10000] rounded-md bg-white/95 px-3 py-1 text-sm font-bold text-red-600 shadow-md"
            style={belowNoteStyle}
          >
            {currentStep.screenNote.text}
          </div>
        )}

      {currentStep.screenNote &&
        currentStep.screenNote.placement === "timeline-scroll" &&
        (() => {
          const noteRect = getTimelineScrollNoteRect();

          if (!noteRect) return null;

          return (
            <div
              className="absolute z-[10001] rounded-md bg-white/95 px-3 py-1.5 text-sm font-bold text-red-600 shadow-md"
              style={{
                top: noteRect.top,
                left: noteRect.left,
                width: noteRect.width,
                minHeight: noteRect.height,
              }}
            >
              <span className="mr-1">↖</span>
              {currentStep.screenNote.text.replace("↘ ", "")}
            </div>
          );
        })()}

      {currentStep.screenNote &&
        currentStep.screenNote.placement === "resolution-control" &&
        (() => {
          const noteRect = getResolutionNoteRect();

          if (!noteRect) return null;

          return (
            <div
              className="absolute z-[10000] rounded-md bg-white/95 px-3 py-1 text-sm font-bold text-red-600 shadow-md"
              style={{
                top: noteRect.top,
                left: noteRect.left,
                width: noteRect.width,
                minHeight: noteRect.height,
              }}
            >
              {currentStep.screenNote.text}
            </div>
          );
        })()}

{isAbnormalityGuideMode(currentStep.highlightMode) &&
  (() => {
    const boxRect = getCurrentAbnormalityBoxRect(currentStep.highlightMode);
    const backgroundRect = getCurrentAbnormalityBackgroundRect(
      currentStep.highlightMode
    );
    const checklistRect = getChecklistOverlayRect();

    const checklistItems =
      currentStep.highlightMode === "annotation-abnormality-draw"
        ? [
            {
              title: "Episode 1",
              time: "09:19 - 09:54",
              active: true,
              checked: false,
            },
          ]
        : [
            {
              title: "Episode 1",
              time: "08:24 - 09:08",
              active: false,
              checked: false,
            },
            {
              title: "Episode 2",
              time:
                currentStep.highlightMode === "annotation-abnormality-adjust"
                  ? "09:12 - 09:58"
                  : "09:19 - 09:54",
              active: true,
              checked:
                currentStep.highlightMode === "annotation-abnormality-save",
            },
            {
              title: "Episode 3",
              time: "10:06 - 10:35",
              active: false,
              checked: false,
            },
            {
              title: "Episode 4",
              time: "08:24 - 09:06",
              active: false,
              checked: false,
            },
          ];

    return (
      <>
        {backgroundRect && (
          <div
            className="absolute z-[10000] bg-sky-200/35"
            style={{
              top: backgroundRect.top,
              left: backgroundRect.left,
              width: backgroundRect.width,
              height: backgroundRect.height,
            }}
          />
        )}

        {boxRect && (
          <div
            className="absolute z-[10001] rounded-sm border-[3px] border-[#c7c900] bg-[#d9e889]/45 shadow-lg"
            style={{
              top: boxRect.top,
              left: boxRect.left,
              width: boxRect.width,
              height: boxRect.height,
            }}
          >
            <div className="absolute left-1/2 top-[-8px] h-[10px] w-[26px] -translate-x-1/2 rounded-full bg-[#ff7a1a] shadow" />

            <div className="absolute bottom-[-8px] left-1/2 h-[10px] w-[26px] -translate-x-1/2 rounded-full bg-[#ff7a1a] shadow" />

            <div className="absolute left-[-8px] top-1/2 h-[26px] w-[10px] -translate-y-1/2 rounded-full bg-[#ff7a1a] shadow" />

            <div className="absolute right-[-8px] top-1/2 h-[26px] w-[10px] -translate-y-1/2 rounded-full bg-[#ff7a1a] shadow" />
          </div>
        )}

        {checklistRect && (
          <div
            className="absolute z-[10002] rounded-xl border border-blue-200 bg-white/95 p-3 shadow-xl"
            style={{
              top: checklistRect.top,
              left: checklistRect.left,
              width: checklistRect.width,
              minHeight: checklistRect.height,
            }}
          >
            <div className="mb-2 text-sm font-bold text-gray-900">
              Checklist
            </div>

            <div className="grid grid-cols-2 gap-2">
              {checklistItems.map((item) => (
                <div
                  key={item.title}
                  className={`relative rounded-lg border px-3 py-2 pr-14 text-xs ${
                    item.active
                      ? "border-blue-600 bg-blue-300 text-blue-950 shadow-sm"
                      : "border-gray-200 bg-white text-gray-800"
                  }`}
                >
                  <div className="font-bold">{item.title}</div>

                  <div className="mt-1 text-gray-500">{item.time}</div>

                  <span
                    className={`absolute right-9 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded border text-[11px] font-bold ${
                      item.checked
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-gray-300 bg-white text-transparent"
                    }`}
                  >
                    ✓
                  </span>

                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-base font-bold text-black">
                    ×
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-3 border-t pt-3 text-xs text-gray-700">
              <span className="mr-4">
                Detected episodes: {checklistItems.length}
              </span>
              <span>
                Selected for reasoning:{" "}
                {currentStep.highlightMode === "annotation-abnormality-save"
                  ? 1
                  : 0}
              </span>
            </div>

            {currentStep.highlightMode === "annotation-abnormality-draw" && (
              <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                <div>
                  1. Draw a box on the Vitals panel using your mouse.
                </div>

                <div className="mt-1">
                  2. The detected episode will appear in this checklist
                  automatically.
                </div>
              </div>
            )}

            {currentStep.highlightMode === "annotation-abnormality-review" && (
              <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
               

                <div className="mt-1">
                  1. Only the currently selected episode is highlighted on the
                  Vitals panel.
                </div>
                <div>
                  2. You can click on other episode button to review the highlighted region again.
                </div>

              
              </div>
            )}

            {currentStep.highlightMode === "annotation-abnormality-adjust" && (
              <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                <div>
                  1. If you want to modify a selected abnormality box, on the vital panel, drag the
                  left or right edge of the box to adjust the time range.
                </div>

                <div className="mt-1">
                  2. The time range in the checklist updates automatically.
                </div>

                <div className="mt-1">
                  3. You can also click the '×' button on a marked episode to
                  delete an incorrect or accidentally selected episode.
                </div>
              </div>
            )}

            {currentStep.highlightMode === "annotation-abnormality-save" && (
              <>
                <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                  <div>
                    1. First, make sure all abnormal episodes have been
                    detected.
                  </div>

                  <div className="mt-1">
                    2. Then select one episode for detailed reasoning.
                  </div>

                  <div className="mt-1">
                    3. Click Save button to save results.
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <span className="rounded-md border bg-white px-3 py-2 text-xs font-semibold text-gray-700">
                    Reset All
                  </span>

                  <span className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white">
                    Save
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </>
    );
  })()}
      {currentStep.highlightMode === "visualization-gas" &&
        (() => {
          const colorColumnRect = getGasColorColumnRect();
          const labelNoteRect = getGasLabelNoteRect();
          const valueNoteRect = getGasValueNoteRect();
          const trajectoryRect = getGasTrajectoryTooltipRect();

          return (
            <>
              {colorColumnRect && (
                <div
                  className="absolute z-[10000] rounded-md border-4 border-orange-400 bg-orange-50/10 shadow-lg"
                  style={{
                    top: colorColumnRect.top,
                    left: colorColumnRect.left,
                    width: colorColumnRect.width,
                    height: colorColumnRect.height,
                  }}
                />
              )}

              {labelNoteRect && (
                <div
                  className="absolute z-[10001] rounded-md bg-white/95 px-3 py-1 text-sm font-bold text-red-600 shadow-md"
                  style={{
                    top: labelNoteRect.top,
                    left: labelNoteRect.left,
                    width: labelNoteRect.width,
                    minHeight: labelNoteRect.height,
                  }}
                >
                  ← Click the color/label area to hide or show one gas row.
                </div>
              )}

              {valueNoteRect && (
                <div
                  className="absolute z-[10000] rounded-md bg-white/95 px-3 py-1 text-sm font-bold text-red-600 shadow-md"
                  style={{
                    top: valueNoteRect.top,
                    left: valueNoteRect.left,
                    width: valueNoteRect.width,
                    minHeight: valueNoteRect.height,
                  }}
                >
                  ↘ Click a value segment to visualize the detailed trajectory.
                </div>
              )}

              {trajectoryRect && (
                <div
                  className="absolute z-[10001] rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-xl"
                  style={{
                    top: trajectoryRect.top,
                    left: trajectoryRect.left,
                    width: trajectoryRect.width,
                    minHeight: trajectoryRect.height,
                  }}
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-gray-900">
                        inO₂ % detail
                      </div>
                      <div className="text-xs text-gray-500">
                        08:15 – 08:30
                      </div>
                    </div>

                    <div className="rounded border px-2 py-0.5 text-xs text-gray-600">
                      Close
                    </div>
                  </div>

                  <div className="relative mt-2 h-36 rounded border border-gray-200 bg-white">
                    <div className="absolute inset-x-10 bottom-8 top-6 bg-[linear-gradient(to_right,rgba(148,163,184,0.35)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.35)_1px,transparent_1px)] bg-[length:52px_100%,100%_32px]" />

                    <div className="absolute left-10 right-5 top-6 h-px bg-gray-300" />
                    <div className="absolute left-10 right-5 bottom-8 h-px bg-gray-300" />

                    <div className="absolute left-2 top-4 text-xs text-gray-500">
                      98
                    </div>
                    <div className="absolute left-2 bottom-6 text-xs text-gray-500">
                      51
                    </div>

                    <svg
                      className="absolute inset-0 h-full w-full"
                      viewBox="0 0 420 150"
                      preserveAspectRatio="none"
                    >
                      <polyline
                        points="40,108 100,116 170,34 240,31 310,35 380,31"
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth="3"
                      />
                      <circle cx="40" cy="108" r="4" fill="#2563eb" />
                      <circle cx="100" cy="116" r="4" fill="#2563eb" />
                      <circle cx="170" cy="34" r="4" fill="#2563eb" />
                      <circle cx="240" cy="31" r="4" fill="#2563eb" />
                      <circle cx="310" cy="35" r="4" fill="#2563eb" />
                      <circle cx="380" cy="31" r="4" fill="#2563eb" />
                    </svg>

                    <div className="absolute bottom-2 left-10 text-xs text-gray-500">
                      08:22
                    </div>
                    <div className="absolute bottom-2 right-5 text-xs text-gray-500">
                      08:29
                    </div>
                  </div>
                </div>
              )}
            </>
          );
        })()}

      {currentStep.highlightMode === "visualization-medication" &&
        (() => {
          const colorSquareRect = getMedicationColorSquareRect();
          const labelNoteRect = getMedicationLabelNoteRect();
          const eventNoteRect = getMedicationEventNoteRect();
          const tooltipRect = getMedicationTooltipRect();

          return (
            <>
              {colorSquareRect && (
                <div
                  className="absolute z-[10000] rounded-md border-4 border-orange-400 bg-orange-50/10 shadow-lg"
                  style={{
                    top: colorSquareRect.top,
                    left: colorSquareRect.left,
                    width: colorSquareRect.width,
                    height: colorSquareRect.height,
                  }}
                />
              )}

              {labelNoteRect && (
                <div
                  className="absolute z-[10001] rounded-md bg-white/95 px-3 py-1 text-sm font-bold text-red-600 shadow-md"
                  style={{
                    top: labelNoteRect.top,
                    left: labelNoteRect.left,
                    width: labelNoteRect.width,
                    minHeight: labelNoteRect.height,
                  }}
                >
                  ← Click the color square to hide or show this medication row.
                </div>
              )}

              {eventNoteRect && (
                <div
                  className="absolute z-[10000] rounded-md bg-white/95 px-3 py-1 text-sm font-bold text-red-600 shadow-md"
                  style={{
                    top: eventNoteRect.top,
                    left: eventNoteRect.left,
                    width: eventNoteRect.width,
                    minHeight: eventNoteRect.height,
                  }}
                >
                  ↘ Click a medication value/icon to show medication name, time,
                  and dose.
                </div>
              )}

              {tooltipRect && (
                <div
                  className="absolute z-[10001] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-xl"
                  style={{
                    top: tooltipRect.top,
                    left: tooltipRect.left,
                    width: tooltipRect.width,
                    minHeight: tooltipRect.height,
                  }}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-bold text-gray-900">fentanyl</span>
                    <span className="text-base font-bold text-gray-400">×</span>
                  </div>

                  <div className="leading-5">Time: 08:55</div>
                  <div className="leading-5">Volume/Dose: 25 mcg</div>
                </div>
              )}
            </>
          );
        })()}

      {currentStep.highlightMode === "visualization-vitals" &&
        (() => {
          const colorColumnRect = getVitalsColorColumnRect();
          const labelNoteRect = getVitalsLabelNoteRect();

          return (
            <>
              {colorColumnRect && (
                <div
                  className="absolute z-[10000] rounded-md border-4 border-orange-400 bg-orange-50/10 shadow-lg"
                  style={{
                    top: colorColumnRect.top,
                    left: colorColumnRect.left,
                    width: colorColumnRect.width,
                    height: colorColumnRect.height,
                  }}
                />
              )}

              {labelNoteRect && (
                <div
                  className="absolute z-[10001] rounded-md bg-white/95 px-3 py-1 text-sm font-bold text-red-600 shadow-md"
                  style={{
                    top: labelNoteRect.top,
                    left: labelNoteRect.left,
                    width: labelNoteRect.width,
                    minHeight: labelNoteRect.height,
                  }}
                >
                  ← Click the color square to hide or show the corresponding
                  vital sign row. This makes the remaining trend lines easier to
                  inspect.
                </div>
              )}
            </>
          );
        })()}

      {currentStep.highlightMode === "visualization-ventilation" &&
        (() => {
          const segmentNoteRect = getVentilationSegmentNoteRect();
          const trajectoryRect = getVentilationTrajectoryRect();

          return (
            <>
              {segmentNoteRect && (
                <div
                  className="absolute z-[10001] rounded-md bg-white/95 px-3 py-1 text-sm font-bold text-red-600 shadow-md"
                  style={{
                    top: segmentNoteRect.top,
                    left: segmentNoteRect.left,
                    width: segmentNoteRect.width,
                    minHeight: segmentNoteRect.height,
                  }}
                >
                  ↘ Click a ventilation value segment to open the detailed
                  trajectory.
                </div>
              )}

              {trajectoryRect && (
                <div
                  className="absolute z-[10002] rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-xl"
                  style={{
                    top: trajectoryRect.top,
                    left: trajectoryRect.left,
                    width: trajectoryRect.width,
                    height: trajectoryRect.height,
                  }}
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-gray-900">MV detail</div>
                      <div className="text-xs text-gray-500">09:30 – 09:44</div>
                    </div>

                    <div className="rounded border px-2 py-0.5 text-xs text-gray-600">
                      Close
                    </div>
                  </div>

                  <div className="relative mt-2 h-[160px] rounded border border-gray-200 bg-white">
                    <div className="absolute inset-x-10 bottom-8 top-5 bg-[linear-gradient(to_right,rgba(148,163,184,0.35)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.35)_1px,transparent_1px)] bg-[length:58px_100%,100%_34px]" />

                    <div className="absolute left-2 top-4 text-xs text-gray-500">
                      3.8
                    </div>

                    <div className="absolute left-2 bottom-6 text-xs text-gray-500">
                      3.6
                    </div>

                    <svg
                      className="absolute inset-0 h-full w-full"
                      viewBox="0 0 620 160"
                      preserveAspectRatio="none"
                    >
                      <polyline
                        points="40,38 88,38 136,38 184,38 232,38 280,38 328,38 376,108 424,38 472,108 520,138 568,108 608,108"
                        fill="none"
                        stroke="#7c3aed"
                        strokeWidth="3"
                      />

                      <circle cx="40" cy="38" r="4" fill="#7c3aed" />
                      <circle cx="88" cy="38" r="4" fill="#7c3aed" />
                      <circle cx="136" cy="38" r="4" fill="#7c3aed" />
                      <circle cx="184" cy="38" r="4" fill="#7c3aed" />
                      <circle cx="232" cy="38" r="4" fill="#7c3aed" />
                      <circle cx="280" cy="38" r="4" fill="#7c3aed" />
                      <circle cx="328" cy="38" r="4" fill="#7c3aed" />
                      <circle cx="376" cy="108" r="4" fill="#7c3aed" />
                      <circle cx="424" cy="38" r="4" fill="#7c3aed" />
                      <circle cx="472" cy="108" r="4" fill="#7c3aed" />
                      <circle cx="520" cy="138" r="4" fill="#7c3aed" />
                      <circle cx="568" cy="108" r="4" fill="#7c3aed" />
                      <circle cx="608" cy="108" r="4" fill="#7c3aed" />
                    </svg>

                    <div className="absolute bottom-2 left-10 text-xs text-gray-500">
                      09:30
                    </div>

                    <div className="absolute bottom-2 right-6 text-xs text-gray-500">
                      09:44
                    </div>
                  </div>
                </div>
              )}
            </>
          );
        })()}

      <div
   className={`absolute max-w-[calc(100vw-32px)] rounded-2xl border bg-white shadow-2xl ${
    isCompactCard ? "w-[420px]" : "w-[600px]"
  }`}
        style={{
          top: cardTop,
          left: cardLeft,
        }}
      >
        <div
          className={`${isCompactCard ? "cursor-default" : "cursor-move"} border-b px-4 py-3`}
          onMouseDown={(e) => {
            if (isCompactCard) return;

            dragStateRef.current = {
              dragging: true,
              offsetX: e.clientX - cardPosition.left,
              offsetY: e.clientY - cardPosition.top,
            };
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                User Guide · Step {progressText}
              </div>
          
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setStepIndex((prev) => Math.max(prev - 1, 0));
                }}
                disabled={isFirstStep}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  isFirstStep
                    ? "cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400"
                    : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                Back
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();

                  if (isLastStep) {
                    onClose();
                    return;
                  }

                  setStepIndex((prev) =>
                    Math.min(prev + 1, GUIDE_STEPS.length - 1)
                  );
                }}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                {isLastStep ? "Done" : "Continue"}
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>

        <div
          className={`overflow-y-auto px-4 py-4 ${
            isCompactCard
              ? "max-h-[calc(100vh-120px)]"
              : "max-h-[calc(100vh-180px)]"
          }`}
        >
          {!isCompactCard && (
            <WorkflowNav
              currentStep={currentStep}
              onJump={(group) => setStepIndex(getFirstStepIndexForGroup(group))}
            />
          )}

          <h2
            className={`font-bold text-gray-900 ${
              isCompactCard ? "text-lg" : "text-xl"
            }`}
          >
            {currentStep.title}
          </h2>

          {currentStep.description &&
            currentStep.highlightMode !== "visualization-ventilation-overview" &&
            currentStep.highlightMode !== "visualization-ventilation" && (
              <p
                className={`mt-2 leading-6 text-gray-600 ${
                  isCompactCard ? "text-xs" : "text-sm"
                }`}
              >
                {currentStep.description}
              </p>
            )}

{currentStep.highlightMode === "submit" && (
  <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold leading-6 text-red-700">
    <div>
      1. When all annotation panels are completed and saved, click Submit. The
      case is successfully uploaded to our Google Cloud storage only after the
      button/status shows “Submitted”.
    </div>

    <div>
     2. Click on Next button to go to the next page only after there is a green 'submitted' status.
    </div>

    <div className="mt-1">
      2. A backup file will also be saved to your computer’s Downloads folder.
      Please keep this file temporarily. If the case is not uploaded correctly,
      you can send this backup file to us.
    </div>
  </div>
)}

          {currentStep.layoutPreview && <LayoutPreview />}
          {currentStep.preopPreview && <PreopPreview />}

          {!currentStep.hidePreview && currentStep.annotationPreview && !isCompactCard && (
            <AnnotationPreview mode={currentStep.annotationPreview.mode} />
          )}

{currentStep.navGroup !== "visualization" &&
  !currentStep.hidePreview &&
  currentStep.visualizationPreview && (
    <VisualizationPreview mode={currentStep.visualizationPreview.mode} />
  )}
        </div>
      </div>
    </div>
  );
}