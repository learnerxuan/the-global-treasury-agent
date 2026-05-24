import type { TimelineEvent } from "../../lib/recon/types";
import type { AgentTimelineEvent, OrchestratorOutput } from "../../lib/recon/reconciliation/types";

type ActivityItem = {
  key: string;
  actorClass: "agent" | "tool" | "orchestrator" | "codetools";
  actor: string;
  tool?: string;
  text: string;
  result?: string;
};

function fromExtraction(events: TimelineEvent[]): ActivityItem[] {
  return events.map((event, i) => ({
    key: `ex-${event.id ?? i}`,
    actorClass: event.agent === "Code Tools" ? "codetools" : "agent",
    actor: event.agent,
    ...(event.toolName ? { tool: event.toolName } : {}),
    text: event.reasoning || event.action,
    ...(event.resultSummary ? { result: event.resultSummary } : {})
  }));
}

// Keep the feed clean: surface observed tool results and routing decisions,
// skip the paired TOOL_CALLED events (redundant with TOOL_RESULT).
function fromAgent2(events: AgentTimelineEvent[]): ActivityItem[] {
  const shown = new Set(["TOOL_RESULT", "CLASSIFICATION_COMPLETED", "ARTIFACT_REQUESTED", "HUMAN_REVIEW_REQUESTED"]);
  return events
    .filter((event) => shown.has(event.eventType))
    .map((event, i) => ({
      key: `a2-${event.step}-${i}`,
      actorClass: event.actor === "Reconciliation Tool" ? "tool" : "orchestrator",
      actor: event.actor === "Reconciliation Tool" ? "Reconciliation Orchestrator" : event.actor,
      ...(event.toolName ? { tool: event.toolName } : {}),
      text: event.reasoning || event.action,
      ...(event.resultSummary ? { result: event.resultSummary } : { result: event.action })
    }));
}

export function AgentActivityPanel({
  extractionTimeline,
  reconciliation,
  processing
}: {
  extractionTimeline: TimelineEvent[];
  reconciliation: OrchestratorOutput | null;
  processing: boolean;
}) {
  const items: ActivityItem[] = [
    ...fromExtraction(extractionTimeline ?? []),
    ...(reconciliation ? fromAgent2(reconciliation.timeline) : [])
  ];

  return (
    <section className="panel activity" aria-label="Agent activity">
      <div className="panel-header">
        <span className="activity-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--green)" }}>
            <rect x="3" y="8" width="18" height="12" rx="2" />
            <path d="M12 8V4" />
            <circle cx="12" cy="3" r="1" />
          </svg>
          Agent Activity
        </span>
        {items.length > 0 ? <span className="activity-steps">{items.length} steps</span> : null}
      </div>

      {items.length === 0 ? (
        <div className="activity-empty">
          {processing ? "Agents are working — extraction and reconciliation in progress…" : "Run reconciliation to see agent activity."}
        </div>
      ) : (
        <div className="activity-feed">
          {items.map((item) => (
            <div className={`activity-item actor-${item.actorClass}`} key={item.key}>
              <span className="activity-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                  <path d="M9 9h6v6H9z" />
                </svg>
              </span>
              <div>
                <div className="activity-headline">
                  <span className="activity-actor">{item.actor}</span>
                  {item.tool ? <span className="activity-tool">{item.tool}</span> : null}
                </div>
                <p className="activity-text">{item.text}</p>
                {item.result ? (
                  <div className="activity-result">
                    <svg className="activity-result-check" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span>{item.result}</span>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
