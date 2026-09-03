/**
 * gravship-worker-web — serves the RimWorld life-support calculator and its
 * save API, behind a signed session cookie issued by a real login page.
 *
 * `run_worker_first: true` in wrangler.jsonc routes EVERY request here first,
 * including static assets, so there is no path that bypasses the auth check.
 */

const MAX_BODY_BYTES = 8 * 1024;

const SESSION_COOKIE = 'rim_session';
/** 30 days, in seconds for Max-Age and in ms for the signed `exp`. */
const SESSION_MAX_AGE = 2592000;

/** Failed logins per IP tolerated in a window before that IP is locked out. */
const MAX_FAILS = 5;
/** Both the counting window and the length of the resulting lockout, in ms. */
const LOCKOUT_MS = 15 * 60 * 1000;
/** The same window in days, the unit `julianday()` counts in. */
const LOCKOUT_DAYS = LOCKOUT_MS / 86400000;

/**
 * SQL fragments for the failure counter, named because each is used more than
 * once and every use has to read the same.
 *
 * `?2` is the current time and `?4` the window length in days. Both refer to
 * `login_attempts`' own columns, so SQLite evaluates them against the row as it
 * stands at write time — see `handleLoginSubmit` for why that matters.
 *
 * A `window_started_at` that `julianday()` cannot parse yields NULL, and NULL
 * counts as lapsed. That matches the `Number.isFinite` guard this replaced, and
 * costs nothing either way: the only values in that column are ones we wrote.
 */
const WINDOW_LAPSED = `(julianday(login_attempts.window_started_at) IS NULL
       OR julianday(?2) - julianday(login_attempts.window_started_at) > ?4)`;

/** The count this attempt lands on. A lapsed window starts over at 1. */
const NEXT_FAIL_COUNT = `(CASE WHEN ${WINDOW_LAPSED} THEN 1
       ELSE login_attempts.fail_count + 1 END)`;

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

/**
 * 303 rather than 302: the browser must switch to GET, so a rejected POST to
 * /login comes back as a plain page load and cannot be re-submitted by a
 * refresh.
 */
function redirect(location, headers = {}) {
  return new Response(null, {
    status: 303,
    headers: { Location: location, 'Cache-Control': 'no-store', ...headers },
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

/** Whether the submitted credentials match the configured ones. */
async function checkCredentials(user, pass, env) {
  const expectedUser = env.AUTH_USER;
  const expectedPass = env.AUTH_PASS;
  // Never fall back to a default credential: an unconfigured Worker denies all.
  // SESSION_SECRET counts as configuration too — without it a "successful"
  // login would mint a cookie signed with an empty key, which anyone could
  // forge. Production sets it with `wrangler secret put SESSION_SECRET`; local
  // development reads it from .dev.vars.
  if (!expectedUser || !expectedPass || !env.SESSION_SECRET) return false;

  // Always evaluate both comparisons so a wrong username and a wrong password
  // take the same time.
  const [userOk, passOk] = await Promise.all([
    safeEqual(user, expectedUser),
    safeEqual(pass, expectedPass),
  ]);
  return userOk && passOk;
}

function base64urlEncode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    text.length + ((4 - (text.length % 4)) % 4),
    '=',
  );
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

async function hmacHex(secret, payload) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Mints `<payload>.<sig>`, where payload is base64url JSON and sig is an
 * HMAC-SHA256 of that exact string. Stateless on purpose: verifying a request
 * is pure crypto, so the common path never touches D1.
 */
async function signSession(username, env) {
  const payload = base64urlEncode(
    JSON.stringify({ u: username, exp: Date.now() + SESSION_MAX_AGE * 1000 }),
  );
  return `${payload}.${await hmacHex(env.SESSION_SECRET, payload)}`;
}

/** Returns the username carried by a valid, unexpired cookie, or null. */
async function verifySession(value, env) {
  if (!env.SESSION_SECRET) return null;

  const sep = value.indexOf('.');
  if (sep <= 0) return null;
  const payload = value.slice(0, sep);
  const sig = value.slice(sep + 1);
  // Exactly one separator: an extra dot means this is not a cookie we minted.
  if (!sig || sig.includes('.')) return null;

  const expected = await hmacHex(env.SESSION_SECRET, payload);
  if (!(await safeEqual(sig, expected))) return null;

  // Only decode AFTER the signature holds, and still defensively: a payload we
  // signed cannot be malformed, but failing closed costs nothing.
  let claims;
  try {
    claims = JSON.parse(base64urlDecode(payload));
  } catch {
    return null;
  }
  if (!claims || typeof claims.u !== 'string' || typeof claims.exp !== 'number') return null;
  if (!(claims.exp > Date.now())) return null;
  return claims.u;
}

/** Reads one cookie out of the request. No framework here, so parse by hand. */
function readCookie(request, name) {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const pair = part.trim();
    const eq = pair.indexOf('=');
    // Compare the whole name, so `not_rim_session=...` does not match.
    if (eq > 0 && pair.slice(0, eq) === name) return pair.slice(eq + 1);
  }
  return null;
}

/**
 * `Secure` rides the same switch as HSTS: `wrangler dev` serves the production
 * hostname over plaintext, and a Secure cookie would never be sent back there,
 * making local login impossible. Fail-safe like `httpsEnforced` itself — the
 * flag has to be set explicitly to drop it.
 */
function sessionCookie(value, env, maxAge) {
  const secure = httpsEnforced(env) ? '; Secure' : '';
  return `${SESSION_COOKIE}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Strict${secure}`;
}

/** Returns the authenticated username, or null. */
async function authenticate(request, env) {
  const value = readCookie(request, SESSION_COOKIE);
  if (!value) return null;
  return verifySession(value, env);
}

/**
 * Accepts only a same-site path. `//evil.com` and `/\evil.com` are
 * protocol-relative URLs that browsers follow off-site, and control characters
 * could split the Location header, so anything but a single leading slash
 * followed by ordinary text falls back to the app root.
 *
 * The accepted set is printable ASCII and nothing else. A header value is a
 * ByteString: a code point above U+00FF makes the Response constructor throw,
 * which reaches the visitor as Cloudflare's raw 1101 page rather than anything
 * this app wrote, and one between U+0080 and U+00FF is silently narrowed to a
 * single latin-1 byte — a header the app never meant to send. Neither is worth
 * supporting, and nothing is lost: a genuinely non-ASCII destination arrives
 * percent-encoded, which is ASCII already and passes through untouched.
 */
function sanitizeNext(value) {
  if (typeof value !== 'string') return '/';
  if (!/^\/(?![/\\])/.test(value)) return '/';
  // One whitelist rather than two blacklists: it still rejects every control
  // character and DEL, and now everything above ASCII as well.
  if (/[^\u0020-\u007E]/.test(value)) return '/';
  return value;
}

/** Sends the visitor back to the login page with a reason the page can show. */
function loginError(error, next, retryAfterSeconds) {
  const params = new URLSearchParams({ error });
  if (retryAfterSeconds !== undefined) params.set('retry', String(retryAfterSeconds));
  params.set('next', next);
  return redirect(`/login?${params}`);
}

async function handleLoginPage(request, env, url) {
  const next = sanitizeNext(url.searchParams.get('next'));
  if (await authenticate(request, env)) return redirect(next);
  // `run_worker_first` means the asset store is only reachable through here, so
  // the login page has to be fetched from the binding explicitly.
  //
  // Ask for `/login`, NOT `/login.html`: the asset layer canonicalises away the
  // `.html` extension by answering a 307 to the extensionless path. The Worker
  // would hand that redirect straight back to the browser, which would request
  // /login again — an infinite redirect loop that makes the site unreachable.
  // Fetching the extensionless path returns the page itself, 200. `ASSETS.fetch`
  // goes to the asset store directly and does not re-enter this Worker, so there
  // is no recursion.
  return env.ASSETS.fetch(new Request(new URL('/login', request.url), request));
}

async function handleLoginSubmit(request, env) {
  // `formData()` rather than parsing `text()` ourselves: the runtime decodes
  // the form charset, and a body that is not a form throws here instead of
  // silently yielding empty fields.
  let fields;
  try {
    fields = await request.formData();
  } catch {
    // A junk body is treated as a failed attempt, not skipped — otherwise it
    // would be a way to probe the endpoint without touching the counter.
    fields = new FormData();
  }
  const next = sanitizeNext(fields.get('next'));

  // Cloudflare sets CF-Connecting-IP at the edge and strips any client-supplied
  // copy, so it cannot be spoofed to dodge the counter.
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();

  // A fast path, and only that. It spares an obviously-locked IP the cost of a
  // SHA-256 pair, but it speaks only for the instant it ran: `checkCredentials`
  // takes real time, and a lockout can land while it is still running. The
  // checks that actually hold the line are the two below, after that gap.
  const row = await env.DB.prepare('SELECT locked_until FROM login_attempts WHERE ip = ?')
    .bind(ip)
    .first();
  if (row?.locked_until) {
    const until = Date.parse(row.locked_until);
    if (Number.isFinite(until) && until > now) {
      return loginError('locked', next, Math.ceil((until - now) / 1000));
    }
  }

  const ok = await checkCredentials(fields.get('username') || '', fields.get('password') || '', env);

  if (ok) {
    // Re-read rather than trusting the row from before the comparison. Without
    // this, a correct password submitted just before the lockout landed still
    // mints a session — the lockout would be exactly one in-flight request
    // wide, and an attacker who keeps one request parked in `checkCredentials`
    // gets a free attempt every time. Reading here narrows the window to a
    // single D1 round trip, which is the floor without a distributed lock;
    // that residual is accepted deliberately.
    const current = await env.DB.prepare('SELECT locked_until FROM login_attempts WHERE ip = ?')
      .bind(ip)
      .first();
    const at = Date.now();
    const until = current?.locked_until ? Date.parse(current.locked_until) : NaN;
    if (Number.isFinite(until) && until > at) {
      // The counter is deliberately left alone. A correct password is not a
      // failed attempt, and clearing the row here — as the DELETE below does on
      // the way to a session — would hand back the lockout just earned.
      return loginError('locked', next, Math.ceil((until - at) / 1000));
    }

    await env.DB.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run();
    const cookie = sessionCookie(await signSession(env.AUTH_USER, env), env, SESSION_MAX_AGE);
    return redirect(next, { 'Set-Cookie': cookie });
  }

  // Every value written here is derived by SQLite from the row's own columns at
  // write time. Nothing comes from a row JavaScript read earlier, and that is
  // the entire point: `checkCredentials` sits between the SELECT above and this
  // write, so any number of requests can land in between.
  //
  // Computing the counter in JS from the earlier read broke twice over. A burst
  // of N concurrent guesses all read the same count and all wrote the same
  // count + 1, so a thousand guesses cost the attacker one. Worse, a slow
  // request that read "not locked" wrote its stale `locked_until = NULL` back
  // over a lockout that faster requests had since earned — keep one request in
  // flight and the IP never locks at all.
  //
  // RETURNING reports what this statement actually decided, so the answer to
  // the visitor comes from the write itself rather than a second, racy read.
  const attempt = await env.DB.prepare(
    `INSERT INTO login_attempts (ip, fail_count, window_started_at, locked_until)
     VALUES (?1, 1, ?2, CASE WHEN 1 >= ?5 THEN ?3 ELSE NULL END)
     ON CONFLICT(ip) DO UPDATE SET
       fail_count = ${NEXT_FAIL_COUNT},
       window_started_at = CASE WHEN ${WINDOW_LAPSED} THEN ?2
         ELSE login_attempts.window_started_at END,
       locked_until = CASE WHEN ${NEXT_FAIL_COUNT} >= ?5 THEN ?3 ELSE NULL END
     RETURNING fail_count, locked_until`,
  )
    .bind(ip, new Date(now).toISOString(), new Date(now + LOCKOUT_MS).toISOString(), LOCKOUT_DAYS, MAX_FAILS)
    .first();

  if (attempt?.locked_until) {
    const until = Date.parse(attempt.locked_until);
    return loginError('locked', next, Math.ceil((until - now) / 1000));
  }
  return loginError('wrong', next);
}

function handleLogout(env) {
  return redirect('/login', { 'Set-Cookie': sessionCookie('', env, 0) });
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

/**
 * The headers every response leaves with, whatever it is.
 *
 * `nosniff` stops a browser second-guessing a Content-Type we stated on
 * purpose — a JSON answer must never be re-read as HTML or script. `DENY` is
 * the clickjacking defence, chosen over a `frame-ancestors` CSP because it says
 * the same thing in one line and nothing here has any business being framed;
 * the login form least of all, since framed and overlaid it is a working
 * credential harvester running on the real origin. Neither header says anything
 * about transport, so unlike HSTS neither is conditional.
 *
 * HSTS is: after one HTTPS visit the browser refuses plaintext by itself, which
 * is what actually defeats an sslstrip attempt, since the very first plaintext
 * request is the one a redirect cannot protect. Sent only over HTTPS, where it
 * is the only place it means anything. The zone-level "Always Use HTTPS"/HSTS
 * setting would normally cover this, but it is not reachable with the deploy
 * token's scopes, so the Worker sets it. Deliberately without
 * `includeSubDomains`: this must not impose HTTPS on other hosts under
 * jairukchan.com that this project does not own.
 *
 * Rebuilding the Response is required because asset responses have immutable
 * headers. Null-body statuses (e.g. a 304 from a conditional asset request)
 * already carry a null body, so passing it through stays legal.
 */
function withSecurityHeaders(response, https) {
  const out = new Response(response.body, response);
  out.headers.set('X-Content-Type-Options', 'nosniff');
  out.headers.set('X-Frame-Options', 'DENY');
  if (https) out.headers.set('Strict-Transport-Security', 'max-age=31536000');
  return out;
}

async function route(request, env, url) {
  // The auth endpoints sit in front of the gate: /login has to be reachable
  // without a session, and /logout has to work even holding a broken one.
  if (url.pathname === '/login') {
    if (request.method === 'GET') return handleLoginPage(request, env, url);
    if (request.method === 'POST') return handleLoginSubmit(request, env);
    return json({ error: 'method not allowed' }, 405, { Allow: 'GET, POST' });
  }

  if (url.pathname === '/logout') {
    // POST only, so a prefetched or embedded GET cannot log the user out.
    if (request.method === 'POST') return handleLogout(env);
    return json({ error: 'method not allowed' }, 405, { Allow: 'POST' });
  }

  const username = await authenticate(request, env);
  if (!username) {
    // index.html's fetch() calls swallow non-ok responses and fall back to
    // localStorage; a redirect would instead be followed and the login page
    // parsed as save data. Only page loads get sent to the login screen.
    if (url.pathname.startsWith('/api/')) return json({ error: 'unauthorized' }, 401);
    return redirect(`/login?next=${encodeURIComponent(sanitizeNext(url.pathname + url.search))}`);
  }

  if (url.pathname === '/api/save') {
    if (request.method === 'GET') return handleGetSave(env, username);
    if (request.method === 'PUT') return handlePutSave(request, env, username);
    return json({ error: 'method not allowed' }, 405, { Allow: 'GET, PUT' });
  }

  if (url.pathname.startsWith('/api/')) {
    return json({ error: 'not found' }, 404);
  }

  return env.ASSETS.fetch(request);
}

/**
 * Whether to force plaintext requests up to HTTPS.
 *
 * `wrangler dev` presents requests as `http://<the routes hostname>/`, i.e. the
 * production host over plaintext — not localhost. So a naive scheme check
 * redirects the developer to the real site instead of serving locally. The
 * escape hatch lives in `.dev.vars` (gitignored, local only); production has no
 * such variable, so the default is to enforce HTTPS. Fail-safe by construction:
 * a missing or misspelt value enforces rather than skips.
 */
function httpsEnforced(env) {
  return env.ALLOW_INSECURE_HTTP !== '1';
}

/**
 * Whether this request reached us over plaintext.
 *
 * Two independent signals, OR'd rather than picking one: `url.protocol` is the
 * scheme the Worker was invoked with, and `CF-Visitor` carries the scheme the
 * client used at the edge. The failure modes are asymmetric — trusting a single
 * signal that turns out unreliable means the upgrade silently never fires and
 * looks correct indefinitely, whereas a false positive is a redirect loop that
 * is obvious within seconds. Requiring both signals to be wrong at once makes
 * the silent failure far less likely.
 */
function isPlaintext(request, url) {
  const visitor = request.headers.get('CF-Visitor') || '';
  return url.protocol === 'http:' || visitor.includes('"scheme":"http"');
}

export default {
  async fetch(request, env) {
    // Nothing below is meant to throw. But an uncaught throw does not reach the
    // visitor as anything this app wrote — the runtime answers with
    // Cloudflare's generic 1101 page, which explains nothing and looks like the
    // site is gone. One catch turns every unforeseen fault into a plain 500
    // instead. This backs up the specific fixes rather than replacing them:
    // a throw that lands here is still a bug worth finding.
    try {
      const url = new URL(request.url);

      // Upgrade before anything else runs. Serving the login form over
      // plaintext would invite the user to type the password into a page an
      // sslstripper can read, so http: gets no login page, no asset, and no D1
      // access.
      if (isPlaintext(request, url) && httpsEnforced(env)) {
        const target = new URL(url);
        target.protocol = 'https:';
        // Only redirect somewhere genuinely different. If CF-Visitor claims
        // http while the Worker was already invoked over https, redirecting
        // would point at the current URL and loop forever, taking the site
        // down; fall through and let HSTS carry it instead.
        if (target.toString() !== url.toString()) {
          // 308 preserves the method, so a PUT to /api/save is not silently
          // downgraded to a GET by a client that follows the redirect.
          return withSecurityHeaders(Response.redirect(target.toString(), 308), false);
        }
      }

      const response = await route(request, env, url);
      return withSecurityHeaders(response, url.protocol === 'https:');
    } catch (err) {
      // Logged, not re-thrown. Re-throwing would put the 1101 page back and
      // undo the point of catching; console.error is what Workers Logs and a
      // Tail Worker read, so the stack still reaches observability. The
      // trade-off taken knowingly: the request no longer counts against the
      // uncaught-exception metric, so the log line is the signal.
      console.error('unhandled error', err);
      // Nothing from `err` goes to the client: the message can name a table, a
      // binding, or a query, none of which the visitor needs.
      return json({ error: 'internal error' }, 500);
    }
  },
};
