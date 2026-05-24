import type { ExtractionRoute } from "./extraction/tools";
import type { Warning } from "./types";

export type TimelineEvent = {
  id: string;
  timestamp: string;
  agent: "Extraction Agent" | "Code Tools";
  action: string;
  toolName?: ExtractionRoute;
  inputSummary: string;
  resultSummary: string;
  reasoning: string;
  observedConfidence?: number;
  warnings: Warning[];
};

export type Timeline = {
  events: TimelineEvent[];
};

export function createTimeline(): Timeline {
  return { events: [] };
}

export function addEvent(timeline: Timeline, event: Omit<TimelineEvent, "id" | "timestamp">): TimelineEvent {
  const created: TimelineEvent = {
    id: `timeline_${String(timeline.events.length + 1).padStart(3, "0")}`,
    timestamp: new Date().toISOString(),
    ...event
  };
  timeline.events.push(created);
  return created;
}

export function listEvents(timeline: Timeline): TimelineEvent[] {
  return [...timeline.events];
}
