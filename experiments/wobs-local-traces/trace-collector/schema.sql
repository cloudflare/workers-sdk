-- Local trace store for the wobs-local-traces prototype.
-- Written by trace-collector on each invocation's `outcome` event.

CREATE TABLE IF NOT EXISTS traces (
  trace_id      TEXT NOT NULL,
  root_span_id  TEXT NOT NULL,
  name          TEXT,
  start_ms      REAL,
  end_ms        REAL,
  duration_ms   REAL,
  outcome       TEXT,           -- runtime outcome: ok | exception | ...
  status_code   INTEGER,        -- HTTP status from the `return` event, if any
  error         TEXT,           -- top-level exception, if any
  span_count    INTEGER,
  created_at    TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (trace_id, root_span_id)
);

CREATE TABLE IF NOT EXISTS spans (
  trace_id     TEXT NOT NULL,
  span_id      TEXT NOT NULL,
  parent_id    TEXT,
  name         TEXT,
  kind         TEXT,            -- http | kv | d1 | fetch | r2 | do | span
  start_ms     REAL,
  end_ms       REAL,
  duration_ms  REAL,
  outcome      TEXT,
  error        TEXT,
  attributes   TEXT,            -- JSON object of span attributes (query text, key, url, ...)
  PRIMARY KEY (trace_id, span_id)
);

CREATE INDEX IF NOT EXISTS idx_traces_created ON traces(created_at);
CREATE INDEX IF NOT EXISTS idx_spans_trace ON spans(trace_id);
CREATE INDEX IF NOT EXISTS idx_spans_kind ON spans(kind);
CREATE INDEX IF NOT EXISTS idx_spans_duration ON spans(duration_ms);

-- One row per console.log emitted during a trace (the "Events" view).
CREATE TABLE IF NOT EXISTS logs (
  trace_id   TEXT NOT NULL,
  span_id    TEXT,
  seq        INTEGER NOT NULL,   -- order within the trace
  ts_ms      REAL,               -- offset from trace start
  level      TEXT,               -- debug | info | log | warn | error
  message    TEXT,               -- JSON-stringified console.log message
  operation  TEXT,               -- root operation name (for the events list)
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (trace_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at);
CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
