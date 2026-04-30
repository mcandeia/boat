-- Append-only lines for in-flight backfill workflow UI (poll GET .../backfill/output?id=).
CREATE TABLE IF NOT EXISTS backfill_workflow_output_line (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  line TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_backfill_out_line_inst ON backfill_workflow_output_line(instance_id, id);
