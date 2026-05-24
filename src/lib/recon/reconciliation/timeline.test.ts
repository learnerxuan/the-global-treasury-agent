import { describe, expect, it } from "vitest";
import { createAgentTimeline, listAgentEvents, recordAgentEvent } from "./timeline";

describe("agent timeline writer", () => {
  it("auto-increments step numbers starting at 1", () => {
    const timeline = createAgentTimeline(() => "2026-05-24T00:00:00.000Z");
    const first = recordAgentEvent(timeline, {
      actor: "Agent 2",
      eventType: "ACTION_SELECTED",
      action: "select generateBankAnchoredCandidates",
      reasoning: "Need candidates before scoring."
    });
    const second = recordAgentEvent(timeline, {
      actor: "Reconciliation Tool",
      eventType: "TOOL_RESULT",
      action: "candidates generated",
      reasoning: "Observed two candidates."
    });
    expect(first.step).toBe(1);
    expect(second.step).toBe(2);
  });

  it("stamps each event with the injected clock", () => {
    const timeline = createAgentTimeline(() => "2026-05-24T12:30:00.000Z");
    const event = recordAgentEvent(timeline, {
      actor: "Agent 2",
      eventType: "TOOL_CALLED",
      action: "calculateFxScenarios",
      reasoning: "Explain the received amount.",
      toolName: "calculateFxScenarios",
      relatedIds: { candidateId: "CAND-001" }
    });
    expect(event.timestamp).toBe("2026-05-24T12:30:00.000Z");
    expect(event.toolName).toBe("calculateFxScenarios");
    expect(event.relatedIds?.candidateId).toBe("CAND-001");
  });

  it("returns a defensive copy of events", () => {
    const timeline = createAgentTimeline(() => "2026-05-24T00:00:00.000Z");
    recordAgentEvent(timeline, { actor: "Agent 2", eventType: "STATE_CHANGED", action: "x", reasoning: "y" });
    const events = listAgentEvents(timeline);
    events.pop();
    expect(listAgentEvents(timeline).length).toBe(1);
  });
});
