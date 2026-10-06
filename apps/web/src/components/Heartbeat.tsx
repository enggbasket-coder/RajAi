"use client";
import { useEffect } from "react";

/** Presence heartbeat every 45s while the tab is open and visible. */
export function Heartbeat() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const beat = () => {
      if (document.visibilityState === "visible") fetch("/api/timer/heartbeat", { method: "POST" }).catch(() => {});
    };
    beat();
    timer = setInterval(beat, 45_000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);
  return null;
}
