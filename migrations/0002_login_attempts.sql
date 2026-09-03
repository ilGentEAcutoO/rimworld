-- Migration number: 0002 	 2026-09-03T00:00:00.000Z
-- One row per client IP, tracking failed /login attempts so a brute-force run
-- can be locked out. Keyed by IP alone: the counter must not be resettable by
-- guessing a different username.
CREATE TABLE login_attempts (
  ip TEXT PRIMARY KEY,
  fail_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  locked_until TEXT
);
