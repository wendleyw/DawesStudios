import { describe, expect, it, vi } from "vitest";
import { runBulkDrop, type BulkDropDependencies, type DeliverableRun } from "./bulk-drop-upload";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function task(id: string, name: string): { id: string; file: File } {
  return { id, file: new File([], name, { type: "image/png" }) };
}

describe("runBulkDrop concurrency", () => {
  it("never has more than the given concurrency limit uploading at once", async () => {
    let active = 0;
    let peak = 0;
    const gates = Array.from({ length: 5 }, () => deferred<string>());
    let call = 0;
    const deps: BulkDropDependencies = {
      uploadArtwork: async () => {
        active++;
        peak = Math.max(peak, active);
        const gate = gates[call++];
        const path = await gate.promise;
        active--;
        return path;
      },
      discardUnreferencedArtwork: async () => {},
      createDesignVersion: async () => "version-new",
      addDesign: async () => {},
    };
    const runs: DeliverableRun[] = [
      {
        deliverableId: "d-square",
        deliverableName: "Campaign square",
        versionChoice: "new",
        files: [
          task("f1", "a.png"),
          task("f2", "b.png"),
          task("f3", "c.png"),
          task("f4", "d.png"),
          task("f5", "e.png"),
        ],
      },
    ];
    const run = runBulkDrop(deps, runs, { concurrency: 3 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(peak).toBe(3);
    gates.forEach((gate, index) => gate.resolve(`path-${index}`));
    await run;
    expect(peak).toBe(3);
  });

  it("registers files in natural order within a deliverable even when uploads resolve out of order", async () => {
    const gates = {
      "b.png": deferred<string>(),
      "a.png": deferred<string>(),
      "c.png": deferred<string>(),
    };
    const started: string[] = [];
    const registered: string[] = [];
    const deps: BulkDropDependencies = {
      uploadArtwork: async (file) => {
        started.push(file.name);
        return gates[file.name as keyof typeof gates].promise;
      },
      discardUnreferencedArtwork: async () => {},
      createDesignVersion: async () => "version-new",
      addDesign: async (_versionId, title) => {
        registered.push(title);
      },
    };
    const runs: DeliverableRun[] = [
      {
        deliverableId: "d-square",
        deliverableName: "Campaign square",
        versionChoice: "new",
        files: [task("f1", "a.png"), task("f2", "b.png"), task("f3", "c.png")],
      },
    ];
    const run = runBulkDrop(deps, runs, { concurrency: 3 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    // All three are uploading at once; they finish b, then c, then a.
    expect(started).toEqual(["a.png", "b.png", "c.png"]);
    gates["b.png"].resolve("path-b");
    await new Promise((resolve) => setTimeout(resolve, 0));
    gates["c.png"].resolve("path-c");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(registered).toEqual([]);
    gates["a.png"].resolve("path-a");
    await run;
    expect(registered).toEqual(["a", "b", "c"]);
  });
});

describe("runBulkDrop isolation and version lifecycle", () => {
  const okDeps = () => ({
    uploadArtwork: vi.fn(async (file: File) => `path/${file.name}`),
    discardUnreferencedArtwork: vi.fn(async () => {}),
    createDesignVersion: vi.fn(async () => "version-new"),
    addDesign: vi.fn(async () => {}),
  });

  it("creates a deliverable's new version exactly once, even with several files", async () => {
    const deps = okDeps();
    await runBulkDrop(deps, [
      {
        deliverableId: "d-square",
        deliverableName: "Campaign square",
        versionChoice: "new",
        files: [task("f1", "a.png"), task("f2", "b.png")],
      },
    ]);
    expect(deps.createDesignVersion).toHaveBeenCalledTimes(1);
    expect(deps.addDesign).toHaveBeenCalledTimes(2);
  });

  it("never calls createDesignVersion when the choice is the current version", async () => {
    const deps = okDeps();
    await runBulkDrop(deps, [
      {
        deliverableId: "d-square",
        deliverableName: "Campaign square",
        versionChoice: "current",
        currentVersionId: "version-1",
        files: [task("f1", "a.png")],
      },
    ]);
    expect(deps.createDesignVersion).not.toHaveBeenCalled();
    expect(deps.addDesign).toHaveBeenCalledWith("version-1", "a", "path/a.png");
  });

  it("reuses a known version id instead of creating a second one on retry", async () => {
    const deps = okDeps();
    await runBulkDrop(
      deps,
      [
        {
          deliverableId: "d-square",
          deliverableName: "Campaign square",
          versionChoice: "new",
          files: [task("f1", "a.png")],
        },
      ],
      { knownVersionIds: { "d-square": "version-already-made" } },
    );
    expect(deps.createDesignVersion).not.toHaveBeenCalled();
    expect(deps.addDesign).toHaveBeenCalledWith("version-already-made", "a", "path/a.png");
  });

  it("never creates a version for a deliverable whose every upload failed", async () => {
    const deps = okDeps();
    deps.uploadArtwork.mockRejectedValue(new Error("network error"));
    const result = await runBulkDrop(deps, [
      {
        deliverableId: "d-square",
        deliverableName: "Campaign square",
        versionChoice: "new",
        files: [task("f1", "a.png"), task("f2", "b.png")],
      },
    ]);
    expect(deps.createDesignVersion).not.toHaveBeenCalled();
    expect(result.outcomes["f1"]).toEqual({ state: "failed", message: "network error" });
    expect(result.outcomes["f2"]).toEqual({ state: "failed", message: "network error" });
  });

  it("marks only the failed upload as failed, without discarding anything or touching its siblings", async () => {
    const deps = okDeps();
    deps.uploadArtwork
      .mockResolvedValueOnce("path/a.png")
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce("path/c.png");
    const result = await runBulkDrop(deps, [
      {
        deliverableId: "d-square",
        deliverableName: "Campaign square",
        versionChoice: "new",
        files: [task("f1", "a.png"), task("f2", "b.png"), task("f3", "c.png")],
      },
    ]);
    expect(result.outcomes["f1"]).toEqual({ state: "done" });
    expect(result.outcomes["f2"]).toEqual({ state: "failed", message: "network error" });
    expect(result.outcomes["f3"]).toEqual({ state: "done" });
    // Nothing was ever stored for f2, so there is nothing to discard.
    expect(deps.discardUnreferencedArtwork).not.toHaveBeenCalled();
    expect(deps.addDesign).toHaveBeenCalledTimes(2);
  });

  it("discards the upload and fails only that file when add_design fails, leaving siblings untouched", async () => {
    const deps = okDeps();
    deps.addDesign
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);
    const result = await runBulkDrop(deps, [
      {
        deliverableId: "d-square",
        deliverableName: "Campaign square",
        versionChoice: "new",
        files: [task("f1", "a.png"), task("f2", "b.png"), task("f3", "c.png")],
      },
    ]);
    expect(result.outcomes["f1"]).toEqual({ state: "done" });
    expect(result.outcomes["f2"]).toEqual({ state: "failed", message: "boom" });
    expect(result.outcomes["f3"]).toEqual({ state: "done" });
    expect(deps.discardUnreferencedArtwork).toHaveBeenCalledWith("path/b.png");
    expect(deps.discardUnreferencedArtwork).toHaveBeenCalledTimes(1);
  });

  it("fails every file in a deliverable when create_design_version fails, discarding what it stored, without touching other deliverables", async () => {
    const deps = okDeps();
    deps.createDesignVersion.mockImplementation(async (deliverableId: string) => {
      if (deliverableId === "d-square") throw new Error("no room");
      return "version-story";
    });
    const result = await runBulkDrop(deps, [
      {
        deliverableId: "d-square",
        deliverableName: "Campaign square",
        versionChoice: "new",
        files: [task("f1", "a.png"), task("f2", "b.png")],
      },
      {
        deliverableId: "d-story",
        deliverableName: "Campaign story",
        versionChoice: "new",
        files: [task("f3", "c.png")],
      },
    ]);
    expect(result.outcomes["f1"]).toEqual({ state: "failed", message: "no room" });
    expect(result.outcomes["f2"]).toEqual({ state: "failed", message: "no room" });
    expect(result.outcomes["f3"]).toEqual({ state: "done" });
    expect(deps.addDesign).toHaveBeenCalledTimes(1);
    // The version is attempted once per deliverable, and nothing it stored is left behind.
    expect(deps.createDesignVersion.mock.calls.filter(([id]) => id === "d-square")).toHaveLength(1);
    expect(deps.discardUnreferencedArtwork.mock.calls.map(([path]) => path).sort()).toEqual([
      "path/a.png",
      "path/b.png",
    ]);
  });

  it("stops the whole batch on a permission-denied error, blocking files not yet registered", async () => {
    const deps = okDeps();
    let calls = 0;
    deps.addDesign.mockImplementation(async () => {
      calls++;
      if (calls === 1) throw new Error("Production access required");
    });
    const result = await runBulkDrop(deps, [
      {
        deliverableId: "d-square",
        deliverableName: "Campaign square",
        versionChoice: "new",
        files: [task("f1", "a.png"), task("f2", "b.png")],
      },
    ]);
    expect(result.permissionDenied).toBe(true);
    expect(result.outcomes["f1"].state).toBe("failed");
    expect(result.outcomes["f2"]).toEqual({ state: "blocked" });
    expect(deps.addDesign).toHaveBeenCalledTimes(1);
    // b.png was already stored when the refusal arrived, so it is discarded rather than orphaned.
    expect(deps.discardUnreferencedArtwork).toHaveBeenCalledWith("path/b.png");
  });

  it("marks not-yet-started files cancelled, while an already in-flight file still finishes and registers", async () => {
    const deps = okDeps();
    const gate = deferred<string>();
    let uploadCalls = 0;
    deps.uploadArtwork.mockImplementation(async (file: File) => {
      uploadCalls++;
      if (uploadCalls === 1) return gate.promise;
      return `path/${file.name}`;
    });
    let cancelled = false;
    // One slot, so b.png is still waiting for it when the person cancels.
    const run = runBulkDrop(
      deps,
      [
        {
          deliverableId: "d-square",
          deliverableName: "Campaign square",
          versionChoice: "new",
          files: [task("f1", "a.png"), task("f2", "b.png")],
        },
      ],
      { concurrency: 1, isCancelled: () => cancelled },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    cancelled = true;
    gate.resolve("path/a.png");
    const result = await run;
    expect(result.outcomes["f1"]).toEqual({ state: "done" });
    expect(result.outcomes["f2"]).toEqual({ state: "cancelled" });
    expect(uploadCalls).toBe(1);
  });
});
