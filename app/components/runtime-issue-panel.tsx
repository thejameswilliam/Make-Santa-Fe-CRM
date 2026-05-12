import type { RuntimeIssue } from "@/lib/runtime-issues";

export function RuntimeIssuePanel({
  issue
}: {
  issue: RuntimeIssue;
}) {
  return (
    <section className="panel runtime-issue-panel">
      <div className="section-stack">
        <span className="eyebrow">Runtime issue</span>
        <h1 className="record-title">{issue.title}</h1>
        <p className="muted">{issue.detail}</p>
      </div>

      <div className="surface-list">
        <div className="surface-row">
          <strong>Recommended next step</strong>
          <p className="muted">
            Open the DigitalOcean app and check the web-service runtime logs first. If the message mentions a missing
            table or column, run the schema sync job or `prisma db push` against production.
          </p>
        </div>

        <div className="surface-row">
          <strong>Session escape hatch</strong>
          <p className="muted">
            If you are stuck in a broken logged-in state, use the logout link below to clear the session cookie and
            return to the login page.
          </p>
        </div>

        {issue.technicalDetail ? (
          <div className="surface-row">
            <strong>Technical detail</strong>
            <p className="form-note">{issue.technicalDetail}</p>
          </div>
        ) : null}
      </div>

      <div className="button-row">
        <a className="button-secondary" href="/api/auth/logout?returnTo=/login?force=1">
          Clear session and return to login
        </a>
      </div>
    </section>
  );
}
