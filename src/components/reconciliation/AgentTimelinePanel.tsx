"use client";

import { useState } from "react";
import type { AgentTimelineEvent, OrchestratorOutput } from "../../lib/recon/reconciliation/types";

function eventMatchesCase(event: AgentTimelineEvent, caseId: string | null): boolean {
  if (!caseId) return true;
  return event.relatedIds?.caseId === caseId;
}

export function AgentTimelinePanel({
  output,
  selectedCaseId
}: {
  output: OrchestratorOutput;
  selectedCaseId: string | null;
}) {
  const [showAll, setShowAll] = useState(false);
  const events = showAll ? output.timeline : output.timeline.filter((event) => eventMatchesCase(event, selectedCaseId));

  return (
    <section className="panel recon-timeline" aria-label="Agent activity timeline">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Agent Activity Timeline</p>
          <h2>How Agent 2 reached each decision</h2>
        </div>
        <button type="button" className="recon-btn recon-btn-secondary" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show selected case" : "Show full batch"}
        </button>
      </div>

      {events.length === 0 ? (
        <p className="recon-empty">No timeline events for this case.</p>
      ) : (
        <ol className="recon-timeline-list">
          {events.map((event) => (
            <li className={`recon-timeline-event recon-actor-${event.actor === "Reconciliation Tool" ? "tool" : "agent"}`} key={`${event.step}-${event.action}`}>
              <div className="recon-timeline-step">{event.step}</div>
              <div className="recon-timeline-body">
                <div className="recon-timeline-headline">
                  <span className="recon-timeline-actor">{event.actor}</span>
                  <span className="recon-timeline-type">{event.eventType.replace(/_/g, " ").toLowerCase()}</span>
                  {event.toolName ? <span className="recon-timeline-tool">{event.toolName}</span> : null}
                </div>
                <p className="recon-timeline-action">{event.action}</p>
                {event.inputSummary ? <p className="recon-timeline-line">Input: {event.inputSummary}</p> : null}
                {event.resultSummary ? <p className="recon-timeline-line">Result: {event.resultSummary}</p> : null}
                <p className="recon-timeline-reasoning">{event.reasoning}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
