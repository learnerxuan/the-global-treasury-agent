import type { AgentTimelineEvent } from "./types";

// Agent 2's own activity timeline. Separate from the extraction-stage timeline
// in ../timeline.ts: this one records orchestration actions, tool calls,
// observed results, and routing decisions — the demo-critical proof that
// classification came from deterministic tools.

export type AgentTimeline = {
  events: AgentTimelineEvent[];
  now: () => string;
};

export function createAgentTimeline(now: () => string = () => new Date().toISOString()): AgentTimeline {
  return { events: [], now };
}

export function recordAgentEvent(
  timeline: AgentTimeline,
  event: Omit<AgentTimelineEvent, "step" | "timestamp">
): AgentTimelineEvent {
  const created: AgentTimelineEvent = {
    ...event,
    step: timeline.events.length + 1,
    timestamp: timeline.now()
  };
  timeline.events.push(created);
  return created;
}

export function listAgentEvents(timeline: AgentTimeline): AgentTimelineEvent[] {
  return [...timeline.events];
}
