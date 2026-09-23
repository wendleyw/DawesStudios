import { z } from "zod";

// Zod 4 probes `Function("")` once to decide whether it may JIT-compile parsers. Under the
// production Content-Security-Policy, which has no 'unsafe-eval', the browser blocks that probe and
// reports a violation on every page that validates input. Jitless mode skips the probe entirely;
// the interpreted parsers are fast enough for this application's form-sized schemas. Import `z`
// from here, never from "zod" directly (enforced in eslint.config.mjs).
z.config({ jitless: true });

export { z };
