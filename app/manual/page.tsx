import { AppShell } from "@/app/components/app-shell";
import { requireSession } from "@/lib/auth";

export default async function ManualPage() {
  const session = await requireSession();

  return (
    <AppShell currentPath="/manual" session={session}>
      <section className="hero-card">
        <span className="eyebrow">Manual</span>
        <h1 className="record-title">How the CRM works</h1>
      </section>

      <section className="split-grid">
        <section className="panel">
          <div>
            <span className="eyebrow">Overview</span>
            <h2 className="section-title">Core model</h2>
          </div>

          <div className="surface-list">
            <div className="surface-row">
              <strong>Everything centers on a person record.</strong>
              <p className="muted">Imported and manual interactions are attached to individual contacts and displayed on the same timeline.</p>
            </div>
            <div className="surface-row">
              <strong>Email is the main matching key.</strong>
              <p className="muted">Exact email matches attach automatically. If a record needs to be combined, use merge by email from the person page.</p>
            </div>
            <div className="surface-row">
              <strong>Imported data and manual data live together.</strong>
              <p className="muted">Manual notes, donations, and membership status changes appear alongside WooCommerce, Gravity Forms, newsletter, sign-in, volunteer, and reservation history.</p>
            </div>
          </div>
        </section>

        <section className="panel">
          <div>
            <span className="eyebrow">Sync</span>
            <h2 className="section-title">Backfill and refresh</h2>
          </div>

          <div className="surface-list">
            <div className="surface-row">
              <strong>Full backfill</strong>
              <p className="muted">Use this for first-time history import or after major bridge or classification changes.</p>
            </div>
            <div className="surface-row">
              <strong>Incremental refresh</strong>
              <p className="muted">Normal day-to-day use relies on stale-source refreshes when pages load.</p>
            </div>
            <div className="surface-row">
              <strong>WordPress remains the source of truth.</strong>
              <p className="muted">The CRM pulls and normalizes data, but it does not write changes back into source systems.</p>
            </div>
          </div>
        </section>
      </section>

      <section className="split-grid">
        <section className="panel">
          <div>
            <span className="eyebrow">Review queue</span>
            <h2 className="section-title">What to do there</h2>
          </div>

          <div className="surface-list">
            <div className="surface-row">
              <strong>Change the event type if needed.</strong>
              <p className="muted">The event-type selector updates the record before assignment. `Class attendance` means a person attended or was tracked against a class. It does not mean class purchase. Class purchases stay under purchase activity.</p>
            </div>
            <div className="surface-row">
              <strong>Assign to an existing contact</strong>
              <p className="muted">Search by email, select the correct contact, and assign without leaving the page.</p>
            </div>
            <div className="surface-row">
              <strong>Create new contact</strong>
              <p className="muted">Use this when the imported email clearly belongs to a new person. Matching pending items with that same email are assigned at the same time.</p>
            </div>
            <div className="surface-row">
              <strong>Dismiss event</strong>
              <p className="muted">Use this when an imported item should not be retained in reporting or history.</p>
            </div>
          </div>
        </section>

        <section className="panel">
          <div>
            <span className="eyebrow">People</span>
            <h2 className="section-title">Record page</h2>
          </div>

          <div className="surface-list">
            <div className="surface-row">
              <strong>Metrics</strong>
              <p className="muted">Each record includes giving, engagement, retention, and composite scores derived from imported and manual activity.</p>
            </div>
            <div className="surface-row">
              <strong>Timeline</strong>
              <p className="muted">The timeline is time-scaled. Node color, connector, and card reflect the interaction lane. Imported and manual interactions can be retyped directly from the timeline.</p>
            </div>
            <div className="surface-row">
              <strong>Merge records</strong>
              <p className="muted">Use merge by email when one person has ended up with duplicate records. The canonical record keeps the combined history.</p>
            </div>
            <div className="surface-row">
              <strong>Add contact</strong>
              <p className="muted">Use the add-contact form on the People page for offline donors or anyone who is not coming in through an imported digital system yet.</p>
            </div>
          </div>
        </section>
      </section>

      <section className="split-grid">
        <section className="panel">
          <div>
            <span className="eyebrow">Manual entry</span>
            <h2 className="section-title">When to use it</h2>
          </div>

          <div className="surface-list">
            <div className="surface-row">
              <strong>Donation</strong>
              <p className="muted">Use for cash, check, or other offline gifts. Donation amount is required and rolls into donor metrics.</p>
            </div>
            <div className="surface-row">
              <strong>Membership</strong>
              <p className="muted">Use membership active, complimentary, paused, or ended to represent status changes that do not come from normal payment flow.</p>
            </div>
            <div className="surface-row">
              <strong>Notes and custom interactions</strong>
              <p className="muted">Use for staff context, conversations, classes, community events, and other organization-specific history that is not imported automatically.</p>
            </div>
          </div>
        </section>

        <section className="panel">
          <div>
            <span className="eyebrow">Mappings</span>
            <h2 className="section-title">Classification rules</h2>
          </div>

          <div className="surface-list">
            <div className="surface-row">
              <strong>Default rules</strong>
              <p className="muted">These are seeded by the app and act as the core fallback classification logic.</p>
            </div>
            <div className="surface-row">
              <strong>Admin-created rules</strong>
              <p className="muted">Use these when you need extra matching logic. Manual rules can be deleted from the mappings page.</p>
            </div>
            <div className="surface-row">
              <strong>Bridge-first behavior</strong>
              <p className="muted">If the WordPress bridge already provides an explicit event kind and lane, the CRM trusts that first. Mapping rules are most useful as fallback logic.</p>
            </div>
          </div>
        </section>
      </section>
    </AppShell>
  );
}
