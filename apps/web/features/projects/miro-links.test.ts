import { describe, expect, it } from "vitest";
import { miroBoardUrl, miroEmbedUrl, parseMiroBoardUrl } from "./miro-links";

describe("parseMiroBoardUrl", () => {
  it("reads a board link", () => {
    expect(parseMiroBoardUrl("https://miro.com/app/board/uXjVKabc123=/")).toEqual({
      boardId: "uXjVKabc123=",
      widgetId: null,
    });
  });

  it("reads a frame link among other query values", () => {
    expect(
      parseMiroBoardUrl(
        " https://miro.com/app/board/uXjVKabc123=/?share_link_id=42&moveToWidget=3458764512345678901&cot=14 ",
      ),
    ).toEqual({ boardId: "uXjVKabc123=", widgetId: "3458764512345678901" });
  });

  it("decodes an encoded board id and accepts www", () => {
    expect(parseMiroBoardUrl("https://www.miro.com/app/board/uXjVKabc123%3D/")).toEqual({
      boardId: "uXjVKabc123=",
      widgetId: null,
    });
  });

  it.each([
    "",
    "http://miro.com/app/board/uXjVKabc123=/",
    "https://evil.example/app/board/uXjVKabc123=/",
    "https://miro.com.evil.example/app/board/uXjVKabc123=/",
    "https://miro.com/app/board/uXjVKabc123=/?moveToWidget=abc",
    "javascript:alert(1)",
  ])("refuses %s", (url) => {
    expect(parseMiroBoardUrl(url)).toBeNull();
  });
});

describe("Miro URLs built from stored ids", () => {
  it("embeds a frame", () => {
    expect(miroEmbedUrl({ boardId: "uXjVKabc123=", widgetId: "345" })).toBe(
      "https://miro.com/app/live-embed/uXjVKabc123%3D/?autoplay=true&moveToWidget=345",
    );
  });

  it("embeds a whole board", () => {
    expect(miroEmbedUrl({ boardId: "uXjVKabc123=", widgetId: null })).toBe(
      "https://miro.com/app/live-embed/uXjVKabc123%3D/?autoplay=true",
    );
  });

  it("opens the frame in Miro", () => {
    expect(miroBoardUrl({ boardId: "uXjVKabc123=", widgetId: "345" })).toBe(
      "https://miro.com/app/board/uXjVKabc123%3D/?moveToWidget=345",
    );
  });
});
