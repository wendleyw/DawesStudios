"use client";

import { useEffect } from "react";

const size = 64;
const framesPerSecond = 15;
const restMs = 10_000;
const tile = "#202226";
const staticIcon = "/brand/favicon.png";

/**
 * Plays the studio's animated mark in the browser tab, in step with the sidebar: the mark plays,
 * rests on its finished frame for ten seconds and plays again. Each frame of the same silent video
 * the sidebar uses is drawn onto a small canvas (the white mark screened onto a tile of the menu
 * colour, like the static `public/brand/favicon.png`) and set as the icon. It runs only while the
 * tab is visible and never with reduced motion; browsers that ignore a changing icon (Safari) keep
 * the static favicon, which is also what shows before the first frame and after unmounting.
 */
export function AnimatedFavicon() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // The icon links are looked up on every use: Next.js re-renders the head's metadata on
    // navigation, which can replace the element a captured reference would still point at.
    const links = () => document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]');
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = "/brand/logo-mark.webm";

    let frame: number | undefined;
    let rest: ReturnType<typeof setTimeout> | undefined;
    let lastDraw = 0;
    const draw = () => {
      if (!video.videoWidth) return;
      context.clearRect(0, 0, size, size);
      context.globalCompositeOperation = "source-over";
      context.fillStyle = tile;
      context.beginPath();
      context.roundRect(0, 0, size, size, 14);
      context.fill();
      // The video is a white mark on black; screening drops the black into the tile.
      const height = size * 0.72;
      const width = (video.videoWidth * height) / video.videoHeight;
      context.globalCompositeOperation = "screen";
      context.drawImage(video, (size - width) / 2, (size - height) / 2, width, height);
      const icon = canvas.toDataURL("image/png");
      for (const link of links()) link.href = icon;
    };
    const loop = (now: number) => {
      if (now - lastDraw >= 1000 / framesPerSecond) {
        lastDraw = now;
        draw();
      }
      if (!video.paused && !video.ended) frame = requestAnimationFrame(loop);
    };
    const play = () => {
      if (document.hidden) return;
      video.currentTime = 0;
      video
        .play()
        .then(() => {
          frame = requestAnimationFrame(loop);
        })
        .catch(() => {});
    };
    const onEnded = () => {
      draw();
      rest = setTimeout(play, restMs);
    };
    const onVisibility = () => {
      if (document.hidden) {
        video.pause();
        clearTimeout(rest);
        if (frame !== undefined) cancelAnimationFrame(frame);
      } else if (video.paused) play();
    };
    video.addEventListener("ended", onEnded);
    document.addEventListener("visibilitychange", onVisibility);
    play();
    return () => {
      video.removeEventListener("ended", onEnded);
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(rest);
      if (frame !== undefined) cancelAnimationFrame(frame);
      video.pause();
      video.removeAttribute("src");
      for (const link of links()) link.href = staticIcon;
    };
  }, []);
  return null;
}
