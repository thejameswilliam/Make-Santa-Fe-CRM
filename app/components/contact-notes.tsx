import type { ContactNote } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export function ContactNotes({
  notes
}: {
  notes: ContactNote[];
}) {
  return (
    <section className="panel">
      <div>
        <span className="eyebrow">Notes</span>
        <h2 className="section-title">User notes</h2>
      </div>

      <div className="note-list">
        {notes.length === 0 ? (
          <div className="empty-state compact-empty-state">No notes yet.</div>
        ) : (
          notes.map((note) => (
            <article className="note-item" key={note.id}>
              <div className="note-item-meta">
                <strong>{note.authorName}</strong>
                <span>{formatDateTime(note.occurredAt)}</span>
              </div>
              <div className="note-item-content">{note.content}</div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
