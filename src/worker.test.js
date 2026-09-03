import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from './worker.js';

const USER = 'testuser';
const PASS = 'test-pass-not-real';

function basic(user, pass) {
  return 'Basic ' + btoa(`${user}:${pass}`);
}

async function call(path, init = {}) {
  const request = new Request(`https://example.com${path}`, init);
  const ctx = createExecutionContext();
  const res = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

function authed(path, init = {}) {
  return call(path, {
    ...init,
    headers: { Authorization: basic(USER, PASS), ...(init.headers || {}) },
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

describe('basic auth', () => {
  it('rejects a request with no Authorization header', async () => {
    const res = await call('/');
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toMatch(/^Basic realm="rimworld"/);
  });

  it('rejects a wrong password', async () => {
    const res = await call('/', { headers: { Authorization: basic(USER, 'wrong-pass') } });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong username', async () => {
    const res = await call('/', { headers: { Authorization: basic('mallory', PASS) } });
    expect(res.status).toBe(401);
  });

  it('rejects a malformed Authorization header', async () => {
    const res = await call('/', { headers: { Authorization: 'Bearer some-token' } });
    expect(res.status).toBe(401);
  });

  it('rejects a username that is a prefix of the real one', async () => {
    const res = await call('/', { headers: { Authorization: basic('test', PASS) } });
    expect(res.status).toBe(401);
  });

  it('lets correct credentials through to the API', async () => {
    const res = await authed('/api/save');
    expect(res.status).toBe(200);
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
