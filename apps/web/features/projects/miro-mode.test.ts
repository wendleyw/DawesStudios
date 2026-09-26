import { describe, expect, it } from "vitest";
import type { CanvasVersion } from "./project-data";
import {
  linkedVersions,
  miroVersionLabel,
  pickMiroVersion,
  readProjectView,
  writeProjectView,
} from "./miro-mode";

const link = { boardId: "uXjVBoard01=", widgetId: "1" };
function version(id: string, deliverableId: string, number: number, date: string, linked = true) {
  return { id, deliverableId, number, date, miro: linked ? link : null } as CanvasVersion;
}
const versions = [
  version("a1", "d-a", 1, "2026-09-01", true),
  version("a2", "d-a", 2, "2026-09-10", true),
  version("a3", "d-a", 3, "2026-09-20", false),
  version("b1", "d-b", 1, "2026-09-15", true),
];

describe("linkedVersions", () => {
  it("keeps only linked versions, newest first", () => {
    expect(linkedVersions(versions, "").map((entry) => entry.id)).toEqual(["b1", "a2", "a1"]);
  });

  it("follows the deliverable filter", () => {
    expect(linkedVersions(versions, "d-a").map((entry) => entry.id)).toEqual(["a2", "a1"]);
  });

  it("orders versions of the same date by number", () => {
    const same = [version("x1", "d", 1, "2026-09-01"), version("x2", "d", 2, "2026-09-01")];
    expect(linkedVersions(same, "").map((entry) => entry.id)).toEqual(["x2", "x1"]);
  });
});

describe("pickMiroVersion", () => {
  const linked = linkedVersions(versions, "");
  it("returns the requested linked version", () => {
    expect(pickMiroVersion(linked, "a1")?.id).toBe("a1");
  });
  it("falls back to the newest for an unknown, unlinked or filtered-out id", () => {
    expect(pickMiroVersion(linked, "a3")?.id).toBe("b1");
    expect(pickMiroVersion(linked, "missing")?.id).toBe("b1");
    expect(pickMiroVersion(linkedVersions(versions, "d-a"), "b1")?.id).toBe("a2");
  });
  it("is null when nothing is linked", () => {
    expect(pickMiroVersion([], "a1")).toBeNull();
  });
});

describe("miroVersionLabel", () => {
  it("names the deliverable and the version", () => {
    expect(miroVersionLabel(versions[1], [{ id: "d-a", name: "Key visual" }])).toBe(
      "Key visual · V2",
    );
  });
  it("falls back when the deliverable is unknown", () => {
    expect(miroVersionLabel(versions[1], [])).toBe("Version · V2");
  });
});

describe("project view URL state", () => {
  it("reads Miro mode and the version", () => {
    expect(readProjectView(new URLSearchParams("view=miro&version=a1"))).toEqual({
      view: "miro",
      versionId: "a1",
    });
  });
  it("defaults to versions", () => {
    expect(readProjectView(new URLSearchParams("view=other"))).toEqual({
      view: "versions",
      versionId: null,
    });
  });
  it("writes Miro mode and keeps other parameters", () => {
    expect(
      writeProjectView(new URLSearchParams("channel=client"), { view: "miro", versionId: "a1" }),
    ).toBe("channel=client&view=miro&version=a1");
  });
  it("removes both parameters for versions", () => {
    expect(
      writeProjectView(new URLSearchParams("channel=client&view=miro&version=a1"), {
        view: "versions",
        versionId: "a1",
      }),
    ).toBe("channel=client");
  });
  it("omits the version when none is chosen", () => {
    expect(writeProjectView(new URLSearchParams(), { view: "miro", versionId: null })).toBe(
      "view=miro",
    );
  });
});
