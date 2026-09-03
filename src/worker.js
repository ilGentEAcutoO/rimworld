/**
 * gravship-worker-web — serves the RimWorld life-support calculator and its
 * save API, with HTTP Basic Auth in front of everything.
 *
 * `run_worker_first: true` in wrangler.jsonc routes EVERY request here first,
 * including static assets, so there is no path that bypasses the auth check.
 */

const REALM = 'rimworld';
const MAX_BODY_BYTES = 8 * 1024;

/** Keys `save()` in public/index.html sends, and the type each one must be. */
const SCALAR = 'scalar';
const STRING_ARRAY = 'string-array';

const ALLOWED_KEYS = {
  schema: SCALAR,
  tab: SCALAR,
  adults: SCALAR,
  kids: SCALAR,
  babies: SCALAR,
  buffer: SCALAR,
  pick: SCALAR,
  watts: SCALAR,
  hours: SCALAR,
  leave: SCALAR,
  leaveSet: SCALAR,
  pack: SCALAR,
  soil: SCALAR,
  kind: SCALAR,
  sort: SCALAR,
  shown: STRING_ARRAY,
  diagCrop: SCALAR,
  diagDays: SCALAR,
  diagPercent: SCALAR,
  heat: SCALAR,
  cool: SCALAR,
  trait: SCALAR,
  drug: SCALAR,
  intervalDays: SCALAR,
  season: SCALAR,
};

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

function unauthorized() {
  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Constant-time string comparison.
 *
 * Both sides are hashed to fixed-width 32-byte digests first, so the comparison
 * never branches on secret length or content — a plain `===` would leak both
 * through timing. `timingSafeEqual` requires equal lengths, which digests
 * guarantee.
 */
async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  if (crypto.subtle.timingSafeEqual) {
    return crypto.subtle.timingSafeEqual(new Uint8Array(da), new Uint8Array(db));
  }
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

/** Returns the authenticated username, or null. */
async function authenticate(request, env) {
  const expectedUser = env.AUTH_USER;
  const expectedPass = env.AUTH_PASS;
  // Never fall back to a default credential: an unconfigured Worker denies all.
  if (!expectedUser || !expectedPass) return null;

  const header = request.headers.get('Authorization');
  if (!header) return null;

  const [scheme, encoded] = header.split(' ');
  if (!encoded || scheme.toLowerCase() !== 'basic') return null;

  let decoded;
  try {
    decoded = new TextDecoder().decode(
      Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)),
    );
  } catch {
    return null;
  }

  // Only the FIRST colon separates user from pass; passwords may contain colons.
  const sep = decoded.indexOf(':');
  if (sep === -1) return null;
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);

  // Always evaluate both comparisons so a wrong username and a wrong password
  // take the same time.
  const [userOk, passOk] = await Promise.all([
    safeEqual(user, expectedUser),
    safeEqual(pass, expectedPass),
  ]);
  return userOk && passOk ? user : null;
}

/**
 * Validates the save payload. Returns { ok: true, value } or { ok: false }.
 * Unknown keys are rejected outright rather than stripped, so a client sending
 * something we do not understand finds out instead of silently losing it.
 */
function validatePayload(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false };
  }
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    // Must be an OWN key of ALLOWED_KEYS. A bare `ALLOWED_KEYS[key]` also
    // resolves inherited Object.prototype members ("constructor", "toString",
    // "__proto__", ...), which would sail past this check and be persisted.
    if (!Object.hasOwn(ALLOWED_KEYS, key)) return { ok: false };
    const kind = ALLOWED_KEYS[key];

    if (kind === STRING_ARRAY) {
      if (!Array.isArray(value)) return { ok: false };
      if (!value.every((v) => typeof v === 'string')) return { ok: false };
      out[key] = value;
      continue;
    }

    const t = typeof value;
    if (value === null || t === 'string' || t === 'boolean') {
      out[key] = value;
    } else if (t === 'number') {
      if (!Number.isFinite(value)) return { ok: false };
      out[key] = value;
    } else {
      return { ok: false };
    }
  }
  return { ok: true, value: out };
}

async function handleGetSave(env, username) {
  const row = await env.DB.prepare('SELECT data FROM saves WHERE username = ?')
    .bind(username)
    .first();
  if (!row) return json({});
  try {
    return json(JSON.parse(row.data));
  } catch {
    // A corrupt row should not brick the calculator; fall back to empty state.
    return json({});
  }
}

async function handlePutSave(request, env, username) {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return json({ error: 'payload too large' }, 413);
  }

  const text = await request.text();
  // Re-check against the real body: Content-Length can be absent or lie.
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return json({ error: 'payload too large' }, 413);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }

  const result = validatePayload(parsed);
  if (!result.ok) return json({ error: 'invalid payload' }, 400);

  await env.DB.prepare(
    `INSERT INTO saves (username, data, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(username) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  )
    .bind(username, JSON.stringify(result.value), new Date().toISOString())
    .run();

  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const username = await authenticate(request, env);
    if (!username) return unauthorized();

    const url = new URL(request.url);

    if (url.pathname === '/api/save') {
      if (request.method === 'GET') return handleGetSave(env, username);
      if (request.method === 'PUT') return handlePutSave(request, env, username);
      return json({ error: 'method not allowed' }, 405, { Allow: 'GET, PUT' });
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'not found' }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};
