import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clipboard from "./album-clipboard";
import * as playgroundData from "./playground-data";
import { PlaygroundAssetStrip } from "./playground-asset-strip";

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: {}, profile: { role: "client" } }),
}));

vi.mock("./playground-data", () => ({
  usePlayground: vi.fn(() => ({
    data: {
      boardId: "b",
      items: [
        {
          id: "pg-1",
          board_id: "b",
          kind: "image",
          title: "Moodboard",
          body: "",
          asset_path: "b/1/m.png",
          mime_type: "image/png",
          x: 0,
          y: 0,
          width: 200,
          height: 200,
          revision: 1,
          url: "https://signed/1",
        },
      ],
    },
  })),
  getPlaygroundDownload: vi.fn().mockResolvedValue("https://signed/download"),
}));

vi.mock("./album-clipboard", () => ({
  copyImageToClipboard: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/features/brand/brand-data", () => ({
  useBrandAssetFolders: vi.fn(() => ({ data: [] })),
  useBrandAssets: vi.fn(() => ({ data: [] })),
  useBrandAssetPreviewUrl: vi.fn(() => ({ data: undefined })),
  downloadBrandAssetFile: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["png"], { type: "image/png" })),
    }),
  );
});

describe("PlaygroundAssetStrip", () => {
  it("shows the Playground album first and copies through the Playground download", async () => {
    render(<PlaygroundAssetStrip clientId="c" projectId="p" onOpenPlayground={() => {}} />);
    const chips = screen.getAllByRole("button", { pressed: false });
    expect(chips[0]).toHaveTextContent("Playground");
    fireEvent.click(chips[0]);
    fireEvent.click(screen.getByRole("button", { name: "Copy Moodboard" }));
    await waitFor(() => expect(clipboard.copyImageToClipboard).toHaveBeenCalledTimes(1));
    const download = vi.mocked(clipboard.copyImageToClipboard).mock.calls[0][0];
    await download();
    expect(playgroundData.getPlaygroundDownload).toHaveBeenCalledWith({}, "b/1/m.png");
  });

  it("opens the full Playground", () => {
    const onOpenPlayground = vi.fn();
    render(<PlaygroundAssetStrip clientId="c" projectId="p" onOpenPlayground={onOpenPlayground} />);
    fireEvent.click(screen.getByRole("button", { name: "Open full Playground" }));
    expect(onOpenPlayground).toHaveBeenCalled();
  });
});
