import { describe, expect, it } from 'vitest';
import { allowedOrigins } from './server.js';

describe('allowed browser origins', () => {
  it('answers the canonical workspace origin on its own', () => {
    expect([...allowedOrigins({ appOrigin: 'http://localhost:3003' })]).toEqual(['http://localhost:3003']);
  });

  it('adds the development origins a machine serves the same application from', () => {
    // A `next dev` beside the container is the case that produced a CORS failure in the browser:
    // the service answered 403 with no `Access-Control-Allow-Origin`, so the preflight never passed.
    const origins = allowedOrigins({ appOrigin: 'http://localhost:3003', additionalOrigins: 'http://localhost:3010,http://localhost:3000' });
    expect(origins.has('http://localhost:3010')).toBe(true);
    expect(origins.has('http://localhost:3000')).toBe(true);
    expect(origins.has('http://localhost:3003')).toBe(true);
  });

  it('separates entries on commas or whitespace and drops the empties', () => {
    const origins = allowedOrigins({ appOrigin: 'http://localhost:3003', additionalOrigins: ' http://localhost:3010 ,, \n http://localhost:3000 ' });
    expect([...origins]).toEqual(['http://localhost:3003', 'http://localhost:3010', 'http://localhost:3000']);
  });

  it('matches an origin whole rather than by prefix or suffix', () => {
    // The list is an allowlist, so anything it does not name is refused — including an origin that
    // merely starts or ends with one that is allowed.
    const origins = allowedOrigins({ appOrigin: 'http://localhost:3003' });
    expect(origins.has('http://localhost:30030')).toBe(false);
    expect(origins.has('https://localhost:3003')).toBe(false);
    expect(origins.has('http://evil.localhost:3003')).toBe(false);
    expect(origins.has('http://localhost:3003.evil.example')).toBe(false);
    expect(origins.has('https://untrusted.example')).toBe(false);
  });

  it('holds nothing when nothing is configured, so every origin is refused', () => {
    expect(allowedOrigins().size).toBe(0);
    expect(allowedOrigins({ additionalOrigins: '' }).size).toBe(0);
  });
});
