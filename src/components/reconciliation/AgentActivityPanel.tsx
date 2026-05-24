import type { AgentActivityEvent } from "../../server/input-extraction/agent-activity";

function actorClass(event: AgentActivityEvent): string {
  if (event.stage === "extraction") return "agent";
  if (event.stage === "code_tools") return "codetools";
  return event.actor === "Reconciliation Orchestrator" ? "orchestrator" : "tool";
}

export function AgentActivityPanel({ activity, processing }: { activity: AgentActivityEvent[]; processing: boolean }) {
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
        {activity.length > 0 ? <span className="activity-steps">{activity.length} steps</span> : null}
      </div>

      {activity.length === 0 ? (
        <div className="activity-empty">
          {processing ? "Agents are working — extraction and reconciliation in progress…" : "Run reconciliation to see agent activity."}
        </div>
      ) : (
        <div className="activity-feed">
          {activity.map((event) => (
            <div className={`activity-item actor-${actorClass(event)}`} key={event.seq}>
              <span className="activity-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                  <path d="M9 9h6v6H9z" />
                </svg>
              </span>
              <div>
                <div className="activity-headline">
                  <span className="activity-actor">{event.actor}</span>
                  {event.toolName ? <span className="activity-tool">{event.toolName}</span> : null}
                </div>
                <p className="activity-text">{event.text}</p>
                {event.result ? (
                  <div className="activity-result">
                    <svg className="activity-result-check" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span>{event.result}</span>
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
