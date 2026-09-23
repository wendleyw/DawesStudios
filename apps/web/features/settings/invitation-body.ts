export type CappedBody = { tooLarge: true } | { tooLarge: false; text: string };

/**
 * Reads a request body as text, capped at `maxBytes`, without ever buffering more than the cap.
 *
 * A `Content-Length` precheck alone is not enough: it is absent under chunked transfer encoding,
 * and a `.length` check after `request.text()` has already resolved means the oversized body was
 * fully received and held in memory before being rejected. This reads the stream one chunk at a
 * time and cancels it the moment the running total passes `maxBytes`, so an oversized chunked
 * body is rejected mid-transfer. Mirrors `readBody` in `apps/media/src/server.js`, adapted from
 * Node's `for await (chunk of request)` to the Fetch `Request.body` this route handler receives.
 */
export async function readCappedBody(request: Request, maxBytes: number): Promise<CappedBody> {
  if (!request.body) return { tooLarge: false, text: "" };
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel("Body exceeds the configured size limit.").catch(() => {});
      return { tooLarge: true };
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return { tooLarge: false, text };
}
