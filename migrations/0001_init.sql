-- Migration number: 0001 	 2026-09-03T00:00:00.000Z
CREATE TABLE saves (
  username TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
