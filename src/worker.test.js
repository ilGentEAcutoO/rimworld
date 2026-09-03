import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, afterEach, beforeEach, beforeAll, vi } from 'vitest';
import worker from './worker.js';

const USER = 'testuser';
const PASS = 'test-pass-not-real';

// The HMAC key for session cookies. vitest.config.mjs pins AUTH_USER/AUTH_PASS;
// this one is pinned here so the tests stay the only place that has to know it.
env.SESSION_SECRET = 'test-session-secret-not-real';

const SESSION_MAX_AGE_MS = 2592000 * 1000;

async function call(path, init = {}, bindings = env) {
  // `path` may be a bare path (defaults to https) or a full URL, so scheme-
  // specific behaviour can be exercised.
  //
  // `bindings` defaults to the shared env; a test that needs one request to
  // behave differently from its concurrent siblings (a stalled or broken D1)
  // passes its own object rather than mutating the env everyone else reads.
  const url = /^https?:\/\//.test(path) ? path : `https://example.com${path}`;
  const request = new Request(url, init);
  const ctx = createExecutionContext();
  const res = await worker.fetch(request, bindings, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

/**
 * Mints a `rim_session` value with the scheme the Worker implements, using
 * crypto.subtle directly. Tests that tamper with or expire a cookie therefore
 * start from a genuinely valid one rather than a parallel reimplementation.
 */
async function signSession(payloadObject, secret = env.SESSION_SECRET) {
  const enc = new TextEncoder();
  const bytes = enc.encode(JSON.stringify(payloadObject));
  const payload = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${payload}.${hex}`;
}

function cookieHeader(value) {
  return { Cookie: `rim_session=${value}` };
}

/** The `name=value` pair a browser would send back from a Set-Cookie header. */
function cookiePair(res) {
  return (res.headers.get('Set-Cookie') || '').split(';')[0];
}

function form(fields) {
  return new URLSearchParams(fields).toString();
}

function postLogin(fields, init = {}, bindings = env) {
  return call(
    '/login',
    {
      method: 'POST',
      ...init,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(init.headers || {}),
      },
      body: form(fields),
    },
    bindings,
  );
}

let VALID_SESSION;

beforeAll(async () => {
  VALID_SESSION = await signSession({ u: USER, exp: Date.now() + SESSION_MAX_AGE_MS });
});

// The shared setup file only clears `saves`; lockout rows would otherwise leak
// from one test into the next and lock IPs that later tests reuse.
beforeEach(async () => {
  await env.DB.prepare('DELETE FROM login_attempts').run();
});

function authed(path, init = {}) {
  return call(path, {
    ...init,
    headers: { ...cookieHeader(VALID_SESSION), ...(init.headers || {}) },
  });
}

/** A payload matching the exact shape `save()` in index.html builds. */
function validPayload(over = {}) {
  return {
    schema: 3,
    tab: 'grow',
    adults: 5,
    kids: 1,
    babies: 0,
    buffer: 0.2,
    pick: 'rice',
    watts: 1000,
    hours: 11,
    leave: null,
    leaveSet: false,
    pack: 3,
    soil: 'hydro',
    kind: 'all',
    sort: 'days',
    shown: ['rice', 'corn'],
    diagCrop: 'rice',
    diagDays: 5,
    diagPercent: 50,
    heat: 7,
    cool: 41,
    trait: 'none',
    drug: 'beer',
    intervalDays: 2,
    season: 60,
    ...over,
  };
}

describe('session cookie', () => {
  it('redirects an unauthenticated page request to the login page', async () => {
    const res = await call('/');
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/login?next=%2F');
    // The browser popup is exactly what this replaces; it must never come back.
    expect(res.headers.get('WWW-Authenticate')).toBeNull();
  });

  it('keeps the original path and query in `next`', async () => {
    const res = await call('/index.html?tab=power');
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/login?next=%2Findex.html%3Ftab%3Dpower');
  });

  // index.html's fetch() calls swallow non-ok responses and fall back to
  // localStorage. A redirect would be followed and parsed as save data, so the
  // API keeps answering 401 rather than joining the page-redirect path.
  it('answers an unauthenticated API request with 401 JSON, not a redirect', async () => {
    const res = await call('/api/save');
    expect(res.status).toBe(401);
    expect(res.headers.get('Content-Type')).toMatch(/application\/json/);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(res.headers.get('WWW-Authenticate')).toBeNull();
  });

  it('lets a valid session cookie through to the API', async () => {
    const res = await authed('/api/save');
    expect(res.status).toBe(200);
  });

  it('ignores an Authorization header now that Basic auth is gone', async () => {
    const res = await call('/api/save', {
      headers: { Authorization: 'Basic ' + btoa(`${USER}:${PASS}`) },
    });
    expect(res.status).toBe(401);
  });

  it('rejects a cookie whose signature was tampered with', async () => {
    const [payload, sig] = VALID_SESSION.split('.');
    const flipped = (sig[0] === 'a' ? 'b' : 'a') + sig.slice(1);
    const res = await call('/api/save', { headers: cookieHeader(`${payload}.${flipped}`) });
    expect(res.status).toBe(401);
  });

  it('rejects a cookie whose payload was swapped under a stale signature', async () => {
    const sig = VALID_SESSION.split('.')[1];
    const forged = await signSession({ u: 'mallory', exp: Date.now() + SESSION_MAX_AGE_MS });
    const res = await call('/api/save', {
      headers: cookieHeader(`${forged.split('.')[0]}.${sig}`),
    });
    expect(res.status).toBe(401);
  });

  it('rejects a correctly shaped cookie signed with a different secret', async () => {
    const other = await signSession(
      { u: USER, exp: Date.now() + SESSION_MAX_AGE_MS },
      'some-other-secret',
    );
    const res = await call('/api/save', { headers: cookieHeader(other) });
    expect(res.status).toBe(401);
  });

  it('rejects a correctly signed but expired cookie', async () => {
    const expired = await signSession({ u: USER, exp: Date.now() - 1000 });
    const res = await call('/api/save', { headers: cookieHeader(expired) });
    expect(res.status).toBe(401);
  });

  it('fails closed on a corrupt cookie instead of throwing', async () => {
    for (const value of ['', 'garbage', 'no-dot-here', 'a.b', '.', '..', 'e30']) {
      const res = await call('/api/save', { headers: cookieHeader(value) });
      expect(res.status).toBe(401);
    }
  });

  it('reads rim_session out of a Cookie header carrying other cookies', async () => {
    const res = await call('/api/save', {
      headers: { Cookie: `theme=dark; rim_session=${VALID_SESSION}; other=1` },
    });
    expect(res.status).toBe(200);
  });

  it('is not fooled by a cookie whose name merely ends in rim_session', async () => {
    const res = await call('/api/save', {
      headers: { Cookie: `not_rim_session=${VALID_SESSION}` },
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /login', () => {
  it('serves the login page from the asset store when unauthenticated', async () => {
    const res = await call('/login');
    expect(res.status).toBe(200);

    // The contract with public/login.html: a real form posting the three fields
    // this Worker reads. Anything less and a correct password cannot get in.
    const body = await res.text();
    expect(body).toContain('action="/login"');
    expect(body).toContain('method="post"');
    for (const field of ['username', 'password', 'next']) {
      expect(body).toContain(`name="${field}"`);
    }
  });

  it('serves the same bytes as the /login.html asset', async () => {
    const [page, asset] = await Promise.all([
      call('/login'),
      env.ASSETS.fetch(new Request('https://example.com/login.html')),
    ]);
    expect(await page.text()).toBe(await asset.text());
  });

  it('asks the asset binding for the extensionless path, not /login.html', async () => {
    // Regression guard for a redirect loop that made the whole site unreachable.
    //
    // The real asset layer canonicalises `.html` away: it answers a request for
    // /login.html with a 307 to /login. The Worker forwards whatever the binding
    // returns, so asking for /login.html sent that 307 to the browser, which
    // requested /login again — forever. Nothing below caught it because the
    // `cloudflare:test` asset emulation serves /login.html as a 200 instead of
    // redirecting, so only the path the Worker *asks for* can be asserted here.
    const spy = vi.spyOn(env.ASSETS, 'fetch');
    try {
      await call('/login');
      expect(spy).toHaveBeenCalled();
      const asked = new URL(spy.mock.calls.at(-1)[0].url);
      expect(asked.pathname).toBe('/login');
    } finally {
      spy.mockRestore();
    }
  });

  it('does not expose the login page at its raw asset path', async () => {
    // Otherwise /login.html would be a second, unversioned entry point that
    // skips the already-authenticated redirect.
    const res = await call('/login.html');
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/login?next=%2Flogin.html');
  });

  it('redirects an already-authenticated visitor away from the login page', async () => {
    const res = await authed('/login');
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/');
  });

  it('honours a safe `next` when an authenticated visitor hits it', async () => {
    const res = await authed('/login?next=%2Findex.html%3Ftab%3Dpower');
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/index.html?tab=power');
  });
});

describe('POST /login', () => {
  it('sets a session cookie and redirects on correct credentials', async () => {
    const res = await postLogin({ username: USER, password: PASS });
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/');

    const cookie = res.headers.get('Set-Cookie');
    expect(cookie).toMatch(/^rim_session=[^;]+/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=2592000/);
    expect(cookie).toMatch(/Secure/);
  });

  it('issues a cookie that actually authenticates the next request', async () => {
    const login = await postLogin({ username: USER, password: PASS });
    const res = await call('/api/save', { headers: { Cookie: cookiePair(login) } });
    expect(res.status).toBe(200);
  });

  it('scopes the save row to the logged-in username', async () => {
    const login = await postLogin({ username: USER, password: PASS });
    await call('/api/save', {
      method: 'PUT',
      headers: { Cookie: cookiePair(login), 'Content-Type': 'application/json' },
      body: JSON.stringify({ adults: 4 }),
    });
    const row = await env.DB.prepare('SELECT username FROM saves').first();
    expect(row.username).toBe(USER);
  });

  it('follows a safe `next` after a successful login', async () => {
    const res = await postLogin({ username: USER, password: PASS, next: '/index.html?tab=grow' });
    expect(res.headers.get('Location')).toBe('/index.html?tab=grow');
  });

  it('rejects a wrong password without setting a cookie', async () => {
    const res = await postLogin({ username: USER, password: 'wrong-pass' });
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toMatch(/^\/login\?/);
    expect(res.headers.get('Location')).toContain('error=wrong');
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('rejects a wrong username without setting a cookie', async () => {
    const res = await postLogin({ username: 'mallory', password: PASS });
    expect(res.headers.get('Location')).toContain('error=wrong');
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('rejects a username that is a prefix of the real one', async () => {
    const res = await postLogin({ username: 'test', password: PASS });
    expect(res.headers.get('Location')).toContain('error=wrong');
  });

  it('rejects an empty submission', async () => {
    const res = await postLogin({});
    expect(res.headers.get('Location')).toContain('error=wrong');
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('carries `next` through a failed attempt so the retry lands right', async () => {
    const res = await postLogin({ username: USER, password: 'nope', next: '/index.html' });
    expect(res.headers.get('Location')).toContain('next=%2Findex.html');
  });

  it('counts a body that is not a form as a failed attempt', async () => {
    const res = await call('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.77' },
      body: '{"username":"' + USER + '"}',
    });
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toContain('error=wrong');
    expect(res.headers.get('Set-Cookie')).toBeNull();

    // A junk body must not be a way to probe /login without moving the counter.
    const row = await env.DB.prepare('SELECT fail_count FROM login_attempts WHERE ip = ?')
      .bind('203.0.113.77')
      .first();
    expect(row.fail_count).toBe(1);
  });

  it('405s a method that is neither GET nor POST', async () => {
    const res = await call('/login', { method: 'DELETE' });
    expect(res.status).toBe(405);
  });
});

describe('login rate limiting', () => {
  const IP = { 'CF-Connecting-IP': '203.0.113.9' };

  function attempt(password, ip = IP) {
    return postLogin({ username: USER, password }, { headers: ip });
  }

  it('locks the IP after five wrong passwords inside the window', async () => {
    for (let i = 0; i < 4; i++) {
      const res = await attempt('wrong-pass');
      expect(res.headers.get('Location')).toContain('error=wrong');
    }
    const fifth = await attempt('wrong-pass');
    expect(fifth.headers.get('Location')).toContain('error=locked');
    expect(fifth.headers.get('Location')).toContain('retry=900');
  });

  // The point of the lockout is that a locked IP cannot go on guessing. If it
  // only delayed the answer, the correct password would still open the door.
  it('rejects even the correct password while the IP is locked', async () => {
    for (let i = 0; i < 5; i++) await attempt('wrong-pass');

    const res = await attempt(PASS);
    expect(res.headers.get('Location')).toContain('error=locked');
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('counts down the remaining lock time', async () => {
    for (let i = 0; i < 5; i++) await attempt('wrong-pass');
    const res = await attempt(PASS);
    const retry = Number(new URL(res.headers.get('Location'), 'https://x').searchParams.get('retry'));
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(900);
  });

  it('counts each IP separately', async () => {
    for (let i = 0; i < 5; i++) await attempt('wrong-pass');

    const other = await postLogin(
      { username: USER, password: PASS },
      { headers: { 'CF-Connecting-IP': '198.51.100.4' } },
    );
    expect(other.status).toBe(303);
    expect(other.headers.get('Set-Cookie')).toMatch(/^rim_session=/);
  });

  it('resets the counter after a successful login', async () => {
    for (let i = 0; i < 4; i++) await attempt('wrong-pass');

    const ok = await attempt(PASS);
    expect(ok.headers.get('Set-Cookie')).toMatch(/^rim_session=/);
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts').first();
    expect(row.n).toBe(0);

    // Four more failures must start a fresh count, not top up the old one.
    for (let i = 0; i < 4; i++) {
      const res = await attempt('wrong-pass');
      expect(res.headers.get('Location')).toContain('error=wrong');
    }
  });

  it('starts a new window once the old one has aged out', async () => {
    for (let i = 0; i < 4; i++) await attempt('wrong-pass');

    // Age the window past 15 minutes without waiting for it.
    await env.DB.prepare('UPDATE login_attempts SET window_started_at = ? WHERE ip = ?')
      .bind(new Date(Date.now() - 16 * 60 * 1000).toISOString(), '203.0.113.9')
      .run();

    const res = await attempt('wrong-pass');
    expect(res.headers.get('Location')).toContain('error=wrong');
    const row = await env.DB.prepare('SELECT fail_count FROM login_attempts WHERE ip = ?')
      .bind('203.0.113.9')
      .first();
    expect(row.fail_count).toBe(1);
  });

  it('lets the IP try again once the lock has expired', async () => {
    for (let i = 0; i < 5; i++) await attempt('wrong-pass');

    await env.DB.prepare('UPDATE login_attempts SET locked_until = ? WHERE ip = ?')
      .bind(new Date(Date.now() - 1000).toISOString(), '203.0.113.9')
      .run();

    const res = await attempt(PASS);
    expect(res.headers.get('Set-Cookie')).toMatch(/^rim_session=/);
  });

  it('falls back to a single bucket when the edge sends no client IP', async () => {
    for (let i = 0; i < 5; i++) {
      await postLogin({ username: USER, password: 'wrong-pass' });
    }
    const res = await postLogin({ username: USER, password: PASS });
    expect(res.headers.get('Location')).toContain('error=locked');
  });
});

describe('login rate limiting under concurrency', () => {
  /**
   * An env whose D1 reads land on the real database but hand their ANSWER back
   * only once `gate` opens. The handler therefore resumes holding a row the
   * rest of the world has already moved past — which is precisely the window a
   * read-modify-write race lives in, and the only way to open it deliberately
   * rather than hoping the scheduler cooperates.
   *
   * Writes are not delayed: the point is a late write computed from an early
   * read, so the write must be free to land last.
   */
  function stalledEnv(gate) {
    const DB = {
      prepare(sql) {
        const stmt = env.DB.prepare(sql);
        return {
          bind(...values) {
            const bound = stmt.bind(...values);
            return {
              async first(...args) {
                const row = await bound.first(...args);
                await gate;
                return row;
              },
              run: (...args) => bound.run(...args),
              all: (...args) => bound.all(...args),
            };
          },
        };
      },
    };
    return { ...env, DB };
  }

  function openable() {
    let open;
    const gate = new Promise((resolve) => {
      open = resolve;
    });
    return { gate, open };
  }

  function wrong(ip, bindings) {
    return postLogin(
      { username: USER, password: 'wrong-pass' },
      { headers: { 'CF-Connecting-IP': ip } },
      bindings,
    );
  }

  function failCountFor(ip) {
    return env.DB.prepare('SELECT fail_count FROM login_attempts WHERE ip = ?').bind(ip).first();
  }

  // Every request in a burst reads the same counter before any of them writes,
  // so a counter computed in JS from that read advances once no matter how many
  // guesses arrived. A thousand parallel guesses would cost an attacker one.
  it('counts every attempt in a concurrent burst, not just one', async () => {
    const ip = '203.0.113.31';
    await Promise.all([wrong(ip), wrong(ip), wrong(ip), wrong(ip)]);

    expect((await failCountFor(ip)).fail_count).toBe(4);
  });

  // The dangerous half of the same race: a request that read "3 failures, not
  // locked" and then took its time writes back "4 failures, not locked" —
  // erasing a lockout two later requests had already earned. Holding one
  // request in flight would keep the IP unlocked indefinitely.
  it('does not erase a lockout that landed while a request was in flight', async () => {
    const ip = '203.0.113.32';
    for (let i = 0; i < 3; i++) await wrong(ip);

    const { gate, open } = openable();
    const stalled = wrong(ip, stalledEnv(gate));

    // Crosses MAX_FAILS while the stalled request still holds its stale row.
    for (let i = 0; i < 2; i++) await wrong(ip);
    open();
    await stalled;

    const res = await postLogin(
      { username: USER, password: PASS },
      { headers: { 'CF-Connecting-IP': ip } },
    );
    expect(res.headers.get('Location')).toContain('error=locked');
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  // The pre-check read can only speak for the moment it happened. A correct
  // password that was already being verified when the lockout landed must still
  // be refused — otherwise the lockout is exactly one in-flight request wide.
  it('refuses a correct password that was in flight when the lockout landed', async () => {
    const ip = '203.0.113.33';
    const { gate, open } = openable();
    const inflight = postLogin(
      { username: USER, password: PASS },
      { headers: { 'CF-Connecting-IP': ip } },
      stalledEnv(gate),
    );

    for (let i = 0; i < 5; i++) await wrong(ip);
    open();

    const res = await inflight;
    expect(res.headers.get('Location')).toContain('error=locked');
    expect(res.headers.get('Set-Cookie')).toBeNull();

    // And it must leave the lockout standing rather than clearing the row on
    // its way out, which would hand the next request a clean slate.
    const after = await postLogin(
      { username: USER, password: PASS },
      { headers: { 'CF-Connecting-IP': ip } },
    );
    expect(after.headers.get('Location')).toContain('error=locked');
  });
});

describe('open redirect via ?next=', () => {
  const HOSTILE = [
    '//evil.com',
    'http://evil.com',
    'https://evil.com/path',
    '/\\evil.com',
    'evil.com',
    '',
    'javascript:alert(1)',
  ];

  it.each(HOSTILE)('sends a successful login to / instead of %o', async (next) => {
    const res = await postLogin({ username: USER, password: PASS, next });
    expect(res.headers.get('Location')).toBe('/');
  });

  it.each(HOSTILE)('sends an authenticated /login visit to / instead of %o', async (next) => {
    const res = await authed(`/login?next=${encodeURIComponent(next)}`);
    expect(res.headers.get('Location')).toBe('/');
  });

  it('does not echo a hostile next back into the failure redirect', async () => {
    const res = await postLogin({ username: USER, password: 'nope', next: '//evil.com' });
    expect(res.headers.get('Location')).toBe('/login?error=wrong&next=%2F');
  });
});

describe('non-ASCII `next`', () => {
  // A Location header value is a ByteString. Putting a code point above U+00FF
  // in one throws inside the Response constructor, and an uncaught throw is
  // Cloudflare's raw 1101 page — so this is a crash, not merely a wrong target.
  //
  // The last entry is the quiet case: a no-break space (U+00A0) is below
  // U+0100, so it converts to latin-1 without complaint and would ship a header
  // byte the app never meant to send instead of failing loudly.
  const NON_ASCII = ['/€', '/café', '/中文', '/a b'];

  it.each(NON_ASCII)('sends a successful login to / instead of %o', async (next) => {
    const res = await postLogin({ username: USER, password: PASS, next });
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/');
  });

  it.each(NON_ASCII)('sends an authenticated /login visit to / instead of %o', async (next) => {
    const res = await authed(`/login?next=${encodeURIComponent(next)}`);
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/');
  });

  // Rejecting non-ASCII costs no real destination, because the redirect the
  // Worker itself builds is already escaped twice over: `url.pathname` is
  // percent-encoded by the URL parser, and `encodeURIComponent` escapes those
  // percent signs again on the way into the query. What comes back out is the
  // ASCII path, not the code points — so the whole trip survives.
  //
  // A singly-escaped `?next=%2F%E2%82%AC` is a different thing: URLSearchParams
  // decodes it to a raw `/€`, indistinguishable from one typed literally, and
  // it lands on `/` with the rest. That is the intended answer, not a gap —
  // by the time sanitizeNext runs, the escaping is already gone.
  it('round-trips a non-ASCII path through the login redirect', async () => {
    const bounced = await call('/€');
    expect(bounced.status).toBe(303);

    const back = await authed(bounced.headers.get('Location'));
    expect(back.headers.get('Location')).toBe('/%E2%82%AC');
  });
});

describe('POST /logout', () => {
  it('clears the cookie and returns to the login page', async () => {
    const res = await authed('/logout', { method: 'POST' });
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/login');

    const cookie = res.headers.get('Set-Cookie');
    expect(cookie).toMatch(/^rim_session=;/);
    expect(cookie).toMatch(/Max-Age=0/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
  });

  it('405s a GET, so a prefetch cannot log the user out', async () => {
    const res = await authed('/logout');
    expect(res.status).toBe(405);
  });
});

describe('GET /api/save', () => {
  it('returns an empty default object when no row exists yet', async () => {
    const res = await authed('/api/save');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/application\/json/);
    await expect(res.json()).resolves.toEqual({});
  });
});

describe('PUT /api/save', () => {
  it('stores a valid payload and round-trips it via GET', async () => {
    const payload = validPayload();
    const put = await authed('/api/save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(put.status).toBe(200);

    const get = await authed('/api/save');
    expect(get.status).toBe(200);
    await expect(get.json()).resolves.toEqual(payload);
  });

  it('upserts rather than duplicating on a second write', async () => {
    for (const adults of [5, 9]) {
      const res = await authed('/api/save', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPayload({ adults })),
      });
      expect(res.status).toBe(200);
    }

    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM saves').first();
    expect(row.n).toBe(1);

    const get = await authed('/api/save');
    expect((await get.json()).adults).toBe(9);
  });

  it('scopes rows to the authenticated username', async () => {
    await authed('/api/save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload({ adults: 7 })),
    });
    const row = await env.DB.prepare('SELECT username FROM saves').first();
    expect(row.username).toBe(USER);
  });

  it('sets updated_at server-side', async () => {
    await authed('/api/save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload()),
    });
    const row = await env.DB.prepare('SELECT updated_at FROM saves').first();
    expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('rejects malformed JSON with 400 and writes nothing', async () => {
    const res = await authed('/api/save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json at all',
    });
    expect(res.status).toBe(400);
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM saves').first();
    expect(row.n).toBe(0);
  });

  it('rejects an unknown key with 400 and writes nothing', async () => {
    const res = await authed('/api/save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload({ evilKey: 'rm -rf' })),
    });
    expect(res.status).toBe(400);
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM saves').first();
    expect(row.n).toBe(0);
  });

  it('rejects a wrong-typed value with 400', async () => {
    const res = await authed('/api/save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload({ adults: { nested: 'object' } })),
    });
    expect(res.status).toBe(400);
  });

  it('rejects a non-object body with 400', async () => {
    const res = await authed('/api/save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([1, 2, 3]),
    });
    expect(res.status).toBe(400);
  });

  it('rejects a non-finite number with 400', async () => {
    const res = await authed('/api/save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{"adults": 1e999}',
    });
    expect(res.status).toBe(400);
  });

  it('rejects shown when it is not an array of strings', async () => {
    const res = await authed('/api/save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload({ shown: [1, 2] })),
    });
    expect(res.status).toBe(400);
  });

  it('accepts a partial payload of known keys', async () => {
    const res = await authed('/api/save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tab: 'power', adults: 3 }),
    });
    expect(res.status).toBe(200);
    await expect((await authed('/api/save')).json()).resolves.toEqual({ tab: 'power', adults: 3 });
  });

  // Regression: a bracket lookup on a plain object literal resolves inherited
  // Object.prototype members truthily, so these keys sailed past the
  // unknown-key check and were persisted.
  const INHERITED_KEYS = [
    'constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf',
    'propertyIsEnumerable', 'toLocaleString', '__defineGetter__',
    '__lookupGetter__', '__proto__',
  ];

  for (const key of INHERITED_KEYS) {
    it(`rejects inherited key "${key}" as the sole key with 400 and writes nothing`, async () => {
      const res = await authed('/api/save', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: `{${JSON.stringify(key)}: "x"}`,
      });
      expect(res.status).toBe(400);
      const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM saves').first();
      expect(row.n).toBe(0);
    });
  }

  it('rejects an inherited key smuggled alongside valid keys', async () => {
    const res = await authed('/api/save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign(validPayload(), { toString: 'x' })),
    });
    expect(res.status).toBe(400);
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM saves').first();
    expect(row.n).toBe(0);
  });

  it('rejects a __proto__ payload without polluting Object.prototype', async () => {
    const res = await authed('/api/save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{"__proto__": {"polluted": true}}',
    });
    expect(res.status).toBe(400);
    expect({}.polluted).toBeUndefined();
    expect(Object.prototype.polluted).toBeUndefined();
  });

  it('rejects an oversized body with 413 and writes nothing', async () => {
    const big = validPayload({ pick: 'x'.repeat(9000) });
    const res = await authed('/api/save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(big),
    });
    expect(res.status).toBe(413);
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM saves').first();
    expect(row.n).toBe(0);
  });

  it('rejects an oversized body declared via Content-Length', async () => {
    const res = await authed('/api/save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': '99999' },
      body: JSON.stringify(validPayload()),
    });
    expect(res.status).toBe(413);
  });
});

describe('plaintext HTTP', () => {
  // An attacker who can sslstrip the connection would otherwise read the
  // password verbatim, so no request is answered over http: at all — not even
  // the login page that would invite the user to type it.
  it('redirects an unauthenticated http request instead of serving it', async () => {
    const res = await call('http://example.com/');
    expect(res.status).toBe(308);
    expect(res.headers.get('Location')).toBe('https://example.com/');
    expect(res.headers.get('WWW-Authenticate')).toBeNull();
  });

  it('upgrades the login page itself rather than showing a plaintext form', async () => {
    const res = await call('http://example.com/login');
    expect(res.status).toBe(308);
    expect(res.headers.get('Location')).toBe('https://example.com/login');
  });

  it('never accepts a password posted in the clear', async () => {
    const res = await call('http://example.com/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({ username: USER, password: PASS }),
    });
    expect(res.status).toBe(308);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  // Second, independent signal: the edge reports the client's real scheme here,
  // so an https-looking invocation is still upgraded if CF-Visitor says http.
  it('redirects when only CF-Visitor reports plaintext', async () => {
    const res = await call('https://example.com/api/save', {
      headers: {
        'CF-Visitor': '{"scheme":"http"}',
        ...cookieHeader(VALID_SESSION),
      },
    });
    // Same-URL redirect would loop, so this falls through to a served response
    // rather than a redirect — but it must never be a plaintext auth challenge.
    expect(res.headers.get('WWW-Authenticate')).toBeNull();
    expect(res.status).toBe(200);
  });

  it('upgrades an http request that CF-Visitor also reports as plaintext', async () => {
    const res = await call('http://example.com/', {
      headers: { 'CF-Visitor': '{"scheme":"http"}' },
    });
    expect(res.status).toBe(308);
    expect(res.headers.get('Location')).toBe('https://example.com/');
    expect(res.headers.get('WWW-Authenticate')).toBeNull();
  });

  it('serves normally when CF-Visitor confirms https', async () => {
    const res = await call('https://example.com/', {
      headers: { 'CF-Visitor': '{"scheme":"https"}' },
    });
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/login?next=%2F');
  });

  // A redirect must never point at the URL that produced it.
  it('never redirects to the request URL itself', async () => {
    for (const hdr of [{}, { 'CF-Visitor': '{"scheme":"http"}' }]) {
      for (const target of ['http://example.com/x', 'https://example.com/x']) {
        const res = await call(target, { headers: hdr });
        if (res.status === 308) {
          expect(res.headers.get('Location')).not.toBe(target);
        }
      }
    }
  });

  it('preserves path and query string in the upgrade', async () => {
    const res = await call('http://example.com/api/save?a=2&tab=food');
    expect(res.status).toBe(308);
    expect(res.headers.get('Location')).toBe('https://example.com/api/save?a=2&tab=food');
  });

  it('redirects even when a valid session cookie is presented over http', async () => {
    const res = await call('http://example.com/api/save', {
      headers: cookieHeader(VALID_SESSION),
    });
    expect(res.status).toBe(308);
    expect(res.headers.get('Location')).toBe('https://example.com/api/save');
  });

  // `wrangler dev` hands the Worker the production hostname over plaintext, so
  // the upgrade has to be switched off explicitly for local work — otherwise
  // local requests get redirected to the real site.
  describe('local dev escape hatch', () => {
    afterEach(() => {
      delete env.ALLOW_INSECURE_HTTP;
    });

    it('serves plaintext normally when ALLOW_INSECURE_HTTP=1', async () => {
      env.ALLOW_INSECURE_HTTP = '1';
      expect((await call('http://example.com/')).status).toBe(303);
      const ok = await call('http://example.com/api/save', {
        headers: cookieHeader(VALID_SESSION),
      });
      expect(ok.status).toBe(200);
    });

    // Same escape hatch as HSTS: a cookie marked Secure would never come back
    // over `wrangler dev`'s plaintext origin, so local login could not work.
    it('drops the Secure attribute on the session cookie', async () => {
      env.ALLOW_INSECURE_HTTP = '1';
      const res = await call('http://example.com/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({ username: USER, password: PASS }),
      });
      expect(res.status).toBe(303);
      expect(res.headers.get('Set-Cookie')).not.toMatch(/Secure/);
      expect(res.headers.get('Set-Cookie')).toMatch(/HttpOnly/);
    });

    it('still omits HSTS when serving over plaintext', async () => {
      env.ALLOW_INSECURE_HTTP = '1';
      const res = await call('http://example.com/');
      expect(res.headers.get('Strict-Transport-Security')).toBeNull();
    });

    // Fail-safe: only the exact string "1" disables the upgrade.
    it.each(['0', 'true', 'yes', '', 'TRUE'])(
      'still enforces HTTPS when the flag is %o',
      async (value) => {
        env.ALLOW_INSECURE_HTTP = value;
        expect((await call('http://example.com/')).status).toBe(308);
      },
    );
  });

  it('does not touch D1 for an http write attempt', async () => {
    const res = await call('http://example.com/api/save', {
      method: 'PUT',
      headers: { ...cookieHeader(VALID_SESSION), 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload()),
    });
    expect(res.status).toBe(308);
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM saves').first();
    expect(row.n).toBe(0);
  });
});

describe('HSTS', () => {
  // The zone-level "Always Use HTTPS"/HSTS toggle is not reachable with the
  // deploy token's scopes, so the Worker sets the header itself.
  it('sets Strict-Transport-Security on the redirect to /login', async () => {
    const res = await call('https://example.com/');
    expect(res.status).toBe(303);
    expect(res.headers.get('Strict-Transport-Security')).toMatch(/max-age=\d+/);
  });

  it('keeps the Set-Cookie header when wrapping a login response', async () => {
    const res = await postLogin({ username: USER, password: PASS });
    expect(res.headers.get('Strict-Transport-Security')).toMatch(/max-age=\d+/);
    expect(res.headers.get('Set-Cookie')).toMatch(/^rim_session=/);
  });

  it('sets Strict-Transport-Security on an authenticated API response', async () => {
    const res = await authed('/api/save');
    expect(res.headers.get('Strict-Transport-Security')).toMatch(/max-age=\d+/);
  });

  it('sets Strict-Transport-Security on a served static asset', async () => {
    const res = await authed('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('Strict-Transport-Security')).toMatch(/max-age=\d+/);
  });

  it('does not send HSTS over plaintext, where it must be ignored anyway', async () => {
    const res = await call('http://example.com/');
    expect(res.headers.get('Strict-Transport-Security')).toBeNull();
  });
});

describe('security headers', () => {
  function expectHardened(res) {
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  }

  it('sets nosniff and DENY on an authenticated API response', async () => {
    expectHardened(await authed('/api/save'));
  });

  // The login form is the page that most needs this: framed and overlaid, it is
  // a working credential harvester on the real origin.
  it('sets them on the login page', async () => {
    const res = await call('/login');
    expect(res.status).toBe(200);
    expectHardened(res);
  });

  it('sets them on a served static asset', async () => {
    expectHardened(await authed('/'));
  });

  // Unlike HSTS and the Secure cookie flag, neither header says anything about
  // transport, so neither rides the HTTPS switch.
  it('sets them over plaintext too, where HSTS is deliberately absent', async () => {
    env.ALLOW_INSECURE_HTTP = '1';
    try {
      const res = await call('http://example.com/login');
      expectHardened(res);
      expect(res.headers.get('Strict-Transport-Security')).toBeNull();
    } finally {
      delete env.ALLOW_INSECURE_HTTP;
    }
  });
});

describe('unexpected errors', () => {
  // Nothing here is meant to throw. But an uncaught throw does not reach the
  // visitor as an error page this app wrote — it reaches them as Cloudflare's
  // generic 1101 screen, which says nothing and looks like the site is gone.
  const brokenDb = {
    prepare() {
      throw new Error('D1 is down');
    },
  };

  function broken() {
    return { ...env, DB: brokenDb };
  }

  it('answers a throw with a 500 JSON body instead of a runtime crash', async () => {
    const res = await postLogin(
      { username: USER, password: PASS },
      { headers: { 'CF-Connecting-IP': '203.0.113.44' } },
      broken(),
    );
    expect(res.status).toBe(500);
    expect(res.headers.get('Content-Type')).toMatch(/application\/json/);
    await expect(res.json()).resolves.toEqual({ error: 'internal error' });
  });

  it('catches a throw on an authenticated API request too', async () => {
    const res = await call('/api/save', { headers: cookieHeader(VALID_SESSION) }, broken());
    expect(res.status).toBe(500);
  });

  // The message may name a table, a binding, or a query. The client gets none
  // of it; Cloudflare's own logs still receive the exception.
  it('does not leak the exception message to the client', async () => {
    const res = await call('/api/save', { headers: cookieHeader(VALID_SESSION) }, broken());
    expect(await res.text()).not.toContain('D1 is down');
  });
});

describe('routing', () => {
  it('405s an unsupported method on /api/save', async () => {
    const res = await authed('/api/save', { method: 'DELETE' });
    expect(res.status).toBe(405);
  });

  it('404s an unknown /api path', async () => {
    const res = await authed('/api/nope');
    expect(res.status).toBe(404);
  });

  it('serves the static index.html for authenticated non-API requests', async () => {
    const res = await authed('/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<!doctype html>');
  });
});
