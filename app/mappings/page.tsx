import { AppShell } from "@/app/components/app-shell";
import { RuntimeIssuePanel } from "@/app/components/runtime-issue-panel";
import { requireSession } from "@/lib/auth";
import { getMappingsScreenData } from "@/lib/crm";
import { LANE_META, SOURCE_LABELS } from "@/lib/constants";
import { getRuntimeIssue } from "@/lib/runtime-issues";

export default async function MappingsPage() {
  const session = await requireSession();
  try {
    const data = await getMappingsScreenData();

    return (
      <AppShell currentPath="/mappings" session={session}>
        <section className="hero-card">
          <span className="eyebrow">Mappings</span>
          <h1 className="record-title">Mappings</h1>
        </section>

        <section className="split-grid">
          <section className="panel">
            <div>
              <span className="eyebrow">Add mapping rule</span>
              <h2 className="section-title">Source classification</h2>
            </div>

            <form action="/api/mappings" className="section-stack" method="post">
              <div className="field-grid">
                <div className="field">
                  <label>
                    Rule name
                    <input name="name" placeholder="Membership Products" required />
                  </label>
                </div>
                <div className="field">
                  <label>
                    Source
                    <select name="source" required>
                      {Object.entries(SOURCE_LABELS)
                        .filter(([source]) => source !== "MANUAL")
                        .map(([source, label]) => (
                          <option key={source} value={source}>
                            {label}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                <div className="field">
                  <label>
                    Matcher type
                    <select name="matcherType" required>
                      <option value="TAG">Tag / product tag</option>
                      <option value="CATEGORY_SLUG">Product category slug</option>
                      <option value="FORM_ID">Form ID</option>
                      <option value="PRODUCT_ID">Product ID</option>
                      <option value="SKU">SKU</option>
                      <option value="CONTAINS">Title or summary contains</option>
                      <option value="DEFAULT">Default</option>
                    </select>
                  </label>
                </div>
                <div className="field">
                  <label>
                    Matcher value
                    <input name="matcherValue" placeholder="membership" required />
                  </label>
                </div>
                <div className="field">
                  <label>
                    Event kind
                    <input name="eventKind" placeholder="membership_payment" required />
                  </label>
                </div>
                <div className="field">
                  <label>
                    Lane
                    <select name="laneKey" required>
                      {Object.entries(LANE_META).map(([laneKey, meta]) => (
                        <option key={laneKey} value={laneKey}>
                          {meta.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="field">
                  <label>
                    Priority
                    <input defaultValue="100" min="1" name="priority" required type="number" />
                  </label>
                </div>
              </div>

              <input name="returnTo" type="hidden" value="/mappings" />
              <button className="button-secondary" type="submit">
                Save mapping rule
              </button>
            </form>
          </section>

          <section className="panel">
            <div>
              <span className="eyebrow">Add manual interaction type</span>
              <h2 className="section-title">Manual taxonomy</h2>
            </div>

            <form action="/api/interaction-types" className="section-stack" method="post">
              <div className="field-grid">
                <div className="field">
                  <label>
                    Type name
                    <input name="name" placeholder="Community Open House" required />
                  </label>
                </div>
                <div className="field">
                  <label>
                    Lane
                    <select name="laneKey" required>
                      {Object.entries(LANE_META).map(([laneKey, meta]) => (
                        <option key={laneKey} value={laneKey}>
                          {meta.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <input name="returnTo" type="hidden" value="/mappings" />
              <button className="button-secondary" type="submit">
                Save interaction type
              </button>
            </form>
          </section>
        </section>

        <section className="card-grid">
          <section className="panel">
            <div>
              <span className="eyebrow">{data.mappingRules.length} rules</span>
              <h2 className="section-title">Current mapping rules</h2>
            </div>

            <div className="surface-list">
              {data.mappingRules.map((rule) => (
                <div className="surface-row" key={rule.id}>
                  <div className="row-between">
                    <strong>{rule.name}</strong>
                    <div className="button-row-compact">
                      <span className="lane-pill">{rule.priority}</span>
                      {!rule.isDefault ? (
                        <form action={`/api/mappings/${rule.id}/delete`} method="post">
                          <input name="returnTo" type="hidden" value="/mappings" />
                          <button className="button-ghost" type="submit">
                            Delete
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                  <p className="muted">
                    {SOURCE_LABELS[rule.source]} · {rule.matcherType} ={" "}
                    <span className="inline-code">{rule.matcherValue}</span>
                  </p>
                  <p className="form-note">
                    {rule.eventKind} → {LANE_META[rule.laneKey].label}
                  </p>
                  {rule.isDefault ? <p className="form-note">Default rule</p> : <p className="form-note">Admin-created rule</p>}
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div>
              <span className="eyebrow">{data.interactionTypes.length} types</span>
              <h2 className="section-title">Current manual interaction types</h2>
            </div>

            <div className="surface-list">
              {data.interactionTypes.map((type) => (
                <div className="surface-row" key={type.id}>
                  <div className="row-between">
                    <strong>{type.name}</strong>
                    <span className="lane-pill">{type.isActive ? "Active" : "Inactive"}</span>
                  </div>
                  <p className="muted">
                    Slug: <span className="inline-code">{type.slug}</span>
                  </p>
                  <p className="form-note">{LANE_META[type.laneKey].label}</p>
                </div>
              ))}
            </div>
          </section>
        </section>
      </AppShell>
    );
  } catch (error) {
    console.error("Mappings page load failed", error);

    return (
      <AppShell currentPath="/mappings" session={session}>
        <RuntimeIssuePanel issue={getRuntimeIssue(error, "Mappings page")} />
      </AppShell>
    );
  }
}
