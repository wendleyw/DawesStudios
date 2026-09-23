import { createRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Artwork } from "./artwork";
import type { CanvasDesign } from "./project-data";

const data = vi.hoisted(() => ({ useDesignAssetUrl: vi.fn() }));
vi.mock("./project-data", () => data);
const design: CanvasDesign = {
  id: "design-a",
  versionId: "version-a",
  title: "Campaign film",
  content: {},
  assetPath: "project/film.mp4",
  order: 0,
};
let source: string;
let refetch: ReturnType<typeof vi.fn>;

function state(video: HTMLVideoElement, values: Record<string, unknown>) {
  for (const [key, value] of Object.entries(values))
    Object.defineProperty(video, key, { configurable: true, writable: true, value });
}
function metadata(video: HTMLVideoElement) {
  state(video, { readyState: 1, duration: 120 });
  fireEvent.loadedMetadata(video);
}

beforeEach(() => {
  vi.clearAllMocks();
  source = "https://private.example/video?token=first";
  refetch = vi.fn(async () => ({ data: source, error: null }));
  data.useDesignAssetUrl.mockImplementation(() => ({
    data: source,
    error: null,
    isFetching: false,
    refetch,
  }));
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(function (
    this: HTMLVideoElement,
  ) {
    this.currentTime = 0;
    state(this as HTMLVideoElement, { readyState: 0, paused: true, ended: false });
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async function (
    this: HTMLVideoElement,
  ) {
    state(this as HTMLVideoElement, { paused: false });
    this.dispatchEvent(new Event("play"));
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
    this: HTMLVideoElement,
  ) {
    state(this as HTMLVideoElement, { paused: true });
    this.dispatchEvent(new Event("pause"));
  });
});

describe("Artwork video loading", () => {
  it("renders a passive video tile without enabling signatures or mounting media", () => {
    const { container } = render(<Artwork design={design} channel="internal" thumbnail />);
    expect(data.useDesignAssetUrl).toHaveBeenCalledWith(design.assetPath, "internal", false);
    expect(screen.getByText("Video")).toBeInTheDocument();
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps image thumbnails signed and displayed as before", () => {
    const image = { ...design, assetPath: "project/still.png" };
    const { container } = render(<Artwork design={image} channel="client" thumbnail />);
    expect(data.useDesignAssetUrl).toHaveBeenCalledWith(image.assetPath, "client", true);
    expect(container.querySelector("img")).toHaveAttribute("src", source);
  });

  it("exposes real controls, metadata and the same video ref used by timed pins", () => {
    const videoRef = createRef<HTMLVideoElement>();
    const onTimeUpdate = vi.fn();
    const onDurationChange = vi.fn();
    const { container } = render(
      <Artwork
        design={design}
        channel="internal"
        videoRef={videoRef}
        onTimeUpdate={onTimeUpdate}
        onDurationChange={onDurationChange}
      />,
    );
    const video = container.querySelector("video")!;
    expect(data.useDesignAssetUrl).toHaveBeenCalledWith(design.assetPath, "internal", true);
    expect(videoRef.current).toBe(video);
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("playsinline");
    expect(video).toHaveAttribute("preload", "metadata");
    expect(video.muted).toBe(false);
    metadata(video);
    video.currentTime = 24;
    fireEvent.timeUpdate(video);
    expect(onDurationChange).toHaveBeenCalledWith(120);
    expect(onTimeUpdate).toHaveBeenLastCalledWith(24);
    act(() => videoRef.current?.pause());
    expect(video.paused).toBe(true);
  });

  it("keeps a paused playhead and media element when a signed URL changes", () => {
    const onTimeUpdate = vi.fn();
    const { container, rerender } = render(
      <Artwork design={design} channel="internal" onTimeUpdate={onTimeUpdate} />,
    );
    const video = container.querySelector("video")!;
    metadata(video);
    video.currentTime = 42;
    fireEvent.timeUpdate(video);
    source = "https://private.example/video?token=renewed";
    rerender(<Artwork design={design} channel="internal" onTimeUpdate={onTimeUpdate} />);
    expect(container.querySelector("video")).toBe(video);
    expect(video).toHaveAttribute("src", source);
    metadata(video);
    expect(video.currentTime).toBe(42);
    expect(video.paused).toBe(true);
    expect(onTimeUpdate).toHaveBeenLastCalledWith(42);
    expect(video.play).not.toHaveBeenCalled();
  });

  it("resumes playing at the prior time and rate after renewal", async () => {
    const { container, rerender } = render(<Artwork design={design} channel="internal" />);
    const video = container.querySelector("video")!;
    metadata(video);
    video.currentTime = 35;
    video.playbackRate = 0.5;
    video.volume = 0.3;
    video.muted = true;
    state(video, { paused: false });
    fireEvent.play(video);
    source = "https://private.example/video?token=renewed";
    rerender(<Artwork design={design} channel="internal" />);
    metadata(video);
    await waitFor(() => expect(video.play).toHaveBeenCalledTimes(1));
    expect(video.currentTime).toBe(35);
    expect(video.playbackRate).toBe(0.5);
    expect(video.volume).toBe(0.3);
    expect(video.muted).toBe(true);
    expect(video.paused).toBe(false);
  });

  it("preserves the original snapshot through overlapping renewals before metadata", () => {
    const { container, rerender } = render(<Artwork design={design} channel="internal" />);
    const video = container.querySelector("video")!;
    metadata(video);
    video.currentTime = 68;
    source = "https://private.example/video?token=second";
    rerender(<Artwork design={design} channel="internal" />);
    expect(video.currentTime).toBe(0);
    source = "https://private.example/video?token=third";
    rerender(<Artwork design={design} channel="internal" />);
    metadata(video);
    expect(video.currentTime).toBe(68);
    expect(video.paused).toBe(true);
  });

  it("does not reload or rewind when query data and callback identities rerender", () => {
    const { container, rerender } = render(
      <Artwork design={design} channel="internal" onTimeUpdate={vi.fn()} />,
    );
    const video = container.querySelector("video")!;
    metadata(video);
    video.currentTime = 27;

    rerender(<Artwork design={{ ...design }} channel="internal" onTimeUpdate={vi.fn()} />);

    expect(container.querySelector("video")).toBe(video);
    expect(video.load).toHaveBeenCalledTimes(1);
    expect(video.currentTime).toBe(27);
  });

  it("keeps timed actions unavailable until a renewed source restores its seek", () => {
    const onVideoReadyChange = vi.fn();
    const { container, rerender } = render(
      <Artwork design={design} channel="internal" onVideoReadyChange={onVideoReadyChange} />,
    );
    const video = container.querySelector("video")!;
    expect(onVideoReadyChange).toHaveBeenLastCalledWith(false);
    metadata(video);
    expect(onVideoReadyChange).toHaveBeenLastCalledWith(true);
    video.currentTime = 64;
    source = "https://private.example/video?token=renewed";

    rerender(
      <Artwork design={design} channel="internal" onVideoReadyChange={onVideoReadyChange} />,
    );
    expect(onVideoReadyChange).toHaveBeenLastCalledWith(false);
    state(video, { seeking: true });
    metadata(video);
    expect(video.currentTime).toBe(64);
    expect(onVideoReadyChange).toHaveBeenLastCalledWith(false);
    state(video, { seeking: false, readyState: 2 });
    fireEvent.seeked(video);
    expect(onVideoReadyChange).toHaveBeenLastCalledWith(true);
    state(video, { readyState: 0 });
    fireEvent.error(video);
    expect(onVideoReadyChange).toHaveBeenLastCalledWith(false);
  });

  it("retries a failed source without losing the last usable playhead", async () => {
    const user = userEvent.setup();
    const { container } = render(<Artwork design={design} channel="internal" />);
    const video = container.querySelector("video")!;
    metadata(video);
    video.currentTime = 51;
    fireEvent.timeUpdate(video);
    state(video, { readyState: 0 });
    video.currentTime = 0;
    fireEvent.error(video);
    await user.click(screen.getByRole("button", { name: "Retry preview" }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(container.querySelector("video")).toBe(video);
    expect(video.load).toHaveBeenCalledTimes(2);
    metadata(video);
    expect(video.currentTime).toBe(51);
    expect(screen.queryByText("Preview unavailable")).not.toBeInTheDocument();
  });

  it("keeps an actionable retry after signing fails", async () => {
    const user = userEvent.setup();
    refetch.mockRejectedValueOnce(new Error("Connection interrupted"));
    const { container } = render(<Artwork design={design} channel="internal" />);
    const video = container.querySelector("video")!;
    fireEvent.error(video);
    await user.click(screen.getByRole("button", { name: "Retry preview" }));
    expect(await screen.findByRole("button", { name: "Retry preview" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Retry preview" }));
    expect(refetch).toHaveBeenCalledTimes(2);
    metadata(video);
    expect(screen.queryByText("Preview unavailable")).not.toBeInTheDocument();
  });

  it("keeps buffered playback usable after a background signing or transient range error", () => {
    const { container, rerender } = render(<Artwork design={design} channel="internal" />);
    const video = container.querySelector("video")!;
    metadata(video);
    video.currentTime = 31;
    state(video, { readyState: 3, paused: false });
    data.useDesignAssetUrl.mockReturnValue({
      data: source,
      error: new Error("Renewal offline"),
      isFetching: false,
      refetch,
    });

    rerender(<Artwork design={design} channel="internal" />);
    fireEvent.error(video);

    expect(screen.queryByText("Preview unavailable")).not.toBeInTheDocument();
    expect(container.querySelector("video")).toBe(video);
    expect(video.currentTime).toBe(31);
    expect(video.paused).toBe(false);
    expect(video.load).toHaveBeenCalledTimes(1);
  });

  it("does not carry a prior design's position or playback into another design", () => {
    const { container, rerender } = render(<Artwork design={design} channel="internal" />);
    const first = container.querySelector("video")!;
    metadata(first);
    first.currentTime = 49;
    state(first, { paused: false });
    fireEvent.play(first);
    rerender(<Artwork design={{ ...design, id: "design-b" }} channel="internal" />);
    const next = container.querySelector("video")!;
    expect(next).not.toBe(first);
    metadata(next);
    expect(next.currentTime).toBe(0);
    expect(next.paused).toBe(true);
    expect(next.play).not.toHaveBeenCalled();
  });

  it("keeps controls usable when the browser refuses automatic playback resume", async () => {
    const { container, rerender } = render(<Artwork design={design} channel="internal" />);
    const video = container.querySelector("video")!;
    metadata(video);
    video.currentTime = 18;
    state(video, { paused: false });
    fireEvent.play(video);
    vi.mocked(video.play).mockRejectedValueOnce(new Error("Playback requires a gesture"));
    source = "https://private.example/video?token=renewed";
    rerender(<Artwork design={design} channel="internal" />);
    metadata(video);
    expect(
      await screen.findByText("Playback is paused. Press Play to continue."),
    ).toBeInTheDocument();
    expect(video).toHaveAttribute("controls");
    expect(video.currentTime).toBe(18);
  });
});
