import { describe, expect, it } from "vitest";
import { formatTimecode, isVideoAsset, visiblePins } from "./video-pins";

describe("isVideoAsset", () => {
  it("recognises the two stored video extensions", () => {
    expect(isVideoAsset("p/a.mp4")).toBe(true);
    expect(isVideoAsset("p/a.webm")).toBe(true);
  });
  it("treats images and a missing path as not video", () => {
    expect(isVideoAsset("p/a.png")).toBe(false);
    expect(isVideoAsset(null)).toBe(false);
  });
});

describe("visiblePins", () => {
  const pins = [{ pinT: 2 }, { pinT: 10 }, { pinT: null }];

  it("shows only pins near the playhead", () => {
    expect(visiblePins(pins, 2.4)).toEqual([{ pinT: 2 }, { pinT: null }]);
  });

  it("shows a pin with no time at every moment, because a still has none", () => {
    expect(visiblePins(pins, 100)).toEqual([{ pinT: null }]);
  });

  it("uses a symmetric window around the playhead", () => {
    expect(visiblePins([{ pinT: 5 }], 6.4, 1.5)).toEqual([{ pinT: 5 }]);
    expect(visiblePins([{ pinT: 5 }], 6.6, 1.5)).toEqual([]);
  });
});

describe("formatTimecode", () => {
  it("reads as minutes and seconds", () => {
    expect(formatTimecode(0)).toBe("0:00");
    expect(formatTimecode(9.4)).toBe("0:09");
    expect(formatTimecode(65)).toBe("1:05");
    expect(formatTimecode(600)).toBe("10:00");
  });
});
