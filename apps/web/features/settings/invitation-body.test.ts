import { describe, expect, it } from "vitest";
import { readCappedBody } from "./invitation-body";

// `readCappedBody` only ever reads `request.body`, so a bare object stands in for `Request` —
// no need to satisfy the Fetch `Request` constructor (which requires `duplex: "half"` for a
// streamed body) just to exercise this function.
function fakeRequest(body: ReadableStream<Uint8Array> | null): Request {
  return { body } as unknown as Request;
}

function streamFromText(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/** `chunkCount` chunks of `chunkBytes` bytes, then closes. `onPull` counts how many were pulled. */
function repeatingChunkStream(
  chunkBytes: number,
  chunkCount: number,
  onPull?: () => void,
): ReadableStream<Uint8Array> {
  const chunk = new TextEncoder().encode("a".repeat(chunkBytes));
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      onPull?.();
      if (sent >= chunkCount) {
        controller.close();
        return;
      }
      sent += 1;
      controller.enqueue(chunk);
    },
  });
}

/** Never closes. Draining this fully would hang forever, so a passing test proves early abort. */
function infiniteChunkStream(chunkBytes: number): ReadableStream<Uint8Array> {
  const chunk = new TextEncoder().encode("a".repeat(chunkBytes));
  return new ReadableStream({
    pull(controller) {
      controller.enqueue(chunk);
    },
  });
}

describe("readCappedBody", () => {
  it("returns the full text for a body under the cap", async () => {
    const text = JSON.stringify({ email: "person@example.test", role: "designer" });
    await expect(readCappedBody(fakeRequest(streamFromText(text)), 4096)).resolves.toEqual({
      tooLarge: false,
      text,
    });
  });

  it("returns empty text when there is no body at all", async () => {
    await expect(readCappedBody(fakeRequest(null), 4096)).resolves.toEqual({
      tooLarge: false,
      text: "",
    });
  });

  it("rejects a finite oversized body without pulling every chunk", async () => {
    let pulls = 0;
    // 20 x 500-byte chunks = 10000 bytes, well over a 4096-byte cap.
    const stream = repeatingChunkStream(500, 20, () => {
      pulls += 1;
    });
    await expect(readCappedBody(fakeRequest(stream), 4096)).resolves.toEqual({ tooLarge: true });
    // The cap is crossed on the 9th chunk (4500 bytes); stopping well short of all 20 proves the
    // stream was aborted, not drained and measured afterward.
    expect(pulls).toBeLessThan(20);
  });

  it("rejects a chunked body that never ends, instead of buffering it first", async () => {
    // If the implementation read to completion before checking the cap, this would never
    // resolve and the test would fail on its timeout rather than on an assertion.
    await expect(readCappedBody(fakeRequest(infiniteChunkStream(1000)), 4096)).resolves.toEqual({
      tooLarge: true,
    });
  });
});
