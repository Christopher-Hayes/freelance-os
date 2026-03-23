"use client";

import { useEffect, useState, useCallback } from "react";
import { type ActivitySession, HOUR_HEIGHT } from "../utils";
import { MINIMAP_HEIGHT_PX } from "../ScrollbarMinimap";

interface ScrollMetrics {
  scrollTop: number;
  viewportHeight: number;
  scrollHeight: number;
}

interface UseScrollSyncReturn {
  activityScrollMetrics: ScrollMetrics;
  projectScrollMetrics: ScrollMetrics;
  isDraggingActivityMinimapViewport: boolean;
  setIsDraggingActivityMinimapViewport: React.Dispatch<React.SetStateAction<boolean>>;
  isDraggingProjectMinimapViewport: boolean;
  setIsDraggingProjectMinimapViewport: React.Dispatch<React.SetStateAction<boolean>>;
  handleActivityScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  handleTimelineScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  jumpActivityMinimapToRatio: (ratio: number) => void;
  dragActivityMinimapViewport: (deltaRatio: number) => void;
  jumpProjectMinimapToRatio: (ratio: number) => void;
  dragProjectMinimapViewport: (deltaRatio: number) => void;
}

const DEFAULT_SCROLL_HEIGHT = 24 * HOUR_HEIGHT + 40;

export function useScrollSync(
  activityScrollRef: React.RefObject<HTMLDivElement | null>,
  timelineRef: React.RefObject<HTMLDivElement | null>,
  selectedDate: unknown, // used as dependency trigger
  loading: boolean,
  mergedVisibleSessions: ActivitySession[]
): UseScrollSyncReturn {
  const [activityScrollMetrics, setActivityScrollMetrics] = useState<ScrollMetrics>({
    scrollTop: 0,
    viewportHeight: MINIMAP_HEIGHT_PX,
    scrollHeight: DEFAULT_SCROLL_HEIGHT,
  });
  const [projectScrollMetrics, setProjectScrollMetrics] = useState<ScrollMetrics>({
    scrollTop: 0,
    viewportHeight: MINIMAP_HEIGHT_PX,
    scrollHeight: DEFAULT_SCROLL_HEIGHT,
  });

  const [isDraggingActivityMinimapViewport, setIsDraggingActivityMinimapViewport] = useState(false);
  const [isDraggingProjectMinimapViewport, setIsDraggingProjectMinimapViewport] = useState(false);

  // Sync activity scroll metrics after data load
  useEffect(() => {
    const activityContainer = activityScrollRef.current;
    if (!activityContainer) return;
    setActivityScrollMetrics({
      scrollTop: activityContainer.scrollTop,
      viewportHeight: activityContainer.clientHeight,
      scrollHeight: activityContainer.scrollHeight,
    });
  }, [selectedDate, loading, mergedVisibleSessions, activityScrollRef]);

  // ── Scroll handlers ──────────────────────────────────────────────────

  const handleActivityScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const nextScrollTop = e.currentTarget.scrollTop;
      setActivityScrollMetrics({
        scrollTop: nextScrollTop,
        viewportHeight: e.currentTarget.clientHeight,
        scrollHeight: e.currentTarget.scrollHeight,
      });
      setProjectScrollMetrics((prev) => ({
        ...prev,
        scrollTop: nextScrollTop,
        viewportHeight: timelineRef.current?.clientHeight ?? prev.viewportHeight,
        scrollHeight: timelineRef.current?.scrollHeight ?? prev.scrollHeight,
      }));
      if (timelineRef.current) timelineRef.current.scrollTop = nextScrollTop;
    },
    [timelineRef]
  );

  const handleTimelineScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const nextScrollTop = e.currentTarget.scrollTop;
      setProjectScrollMetrics({
        scrollTop: nextScrollTop,
        viewportHeight: e.currentTarget.clientHeight,
        scrollHeight: e.currentTarget.scrollHeight,
      });
      setActivityScrollMetrics((prev) => ({
        ...prev,
        scrollTop: nextScrollTop,
        viewportHeight: activityScrollRef.current?.clientHeight ?? prev.viewportHeight,
        scrollHeight: activityScrollRef.current?.scrollHeight ?? prev.scrollHeight,
      }));
      if (activityScrollRef.current) activityScrollRef.current.scrollTop = nextScrollTop;
    },
    [activityScrollRef]
  );

  // ── Minimap jump/drag helpers ────────────────────────────────────────

  const syncBothScrolls = useCallback(
    (nextScrollTop: number, source: "activity" | "project") => {
      const activityContainer = activityScrollRef.current;
      const projectContainer = timelineRef.current;

      if (source === "activity" && activityContainer) {
        activityContainer.scrollTop = nextScrollTop;
        if (projectContainer) projectContainer.scrollTop = nextScrollTop;
        setActivityScrollMetrics({
          scrollTop: nextScrollTop,
          viewportHeight: activityContainer.clientHeight,
          scrollHeight: activityContainer.scrollHeight,
        });
        setProjectScrollMetrics((prev) => ({
          ...prev,
          scrollTop: nextScrollTop,
          viewportHeight: projectContainer?.clientHeight ?? prev.viewportHeight,
          scrollHeight: projectContainer?.scrollHeight ?? prev.scrollHeight,
        }));
      } else if (source === "project" && projectContainer) {
        projectContainer.scrollTop = nextScrollTop;
        if (activityContainer) activityContainer.scrollTop = nextScrollTop;
        setProjectScrollMetrics({
          scrollTop: nextScrollTop,
          viewportHeight: projectContainer.clientHeight,
          scrollHeight: projectContainer.scrollHeight,
        });
        setActivityScrollMetrics((prev) => ({
          ...prev,
          scrollTop: nextScrollTop,
          viewportHeight: activityContainer?.clientHeight ?? prev.viewportHeight,
          scrollHeight: activityContainer?.scrollHeight ?? prev.scrollHeight,
        }));
      }
    },
    [activityScrollRef, timelineRef]
  );

  const jumpActivityMinimapToRatio = useCallback(
    (ratio: number) => {
      const container = activityScrollRef.current;
      if (!container) return;
      const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0);
      const nextScrollTop = Math.max(0, Math.min(maxScrollTop, ratio * maxScrollTop));
      syncBothScrolls(nextScrollTop, "activity");
    },
    [activityScrollRef, syncBothScrolls]
  );

  const dragActivityMinimapViewport = useCallback(
    (deltaRatio: number) => {
      const container = activityScrollRef.current;
      if (!container) return;
      const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0);
      const nextScrollTop = Math.max(
        0,
        Math.min(maxScrollTop, container.scrollTop + deltaRatio * maxScrollTop)
      );
      syncBothScrolls(nextScrollTop, "activity");
    },
    [activityScrollRef, syncBothScrolls]
  );

  const jumpProjectMinimapToRatio = useCallback(
    (ratio: number) => {
      const container = timelineRef.current;
      if (!container) return;
      const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0);
      const nextScrollTop = Math.max(0, Math.min(maxScrollTop, ratio * maxScrollTop));
      syncBothScrolls(nextScrollTop, "project");
    },
    [timelineRef, syncBothScrolls]
  );

  const dragProjectMinimapViewport = useCallback(
    (deltaRatio: number) => {
      const container = timelineRef.current;
      if (!container) return;
      const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0);
      const nextScrollTop = Math.max(
        0,
        Math.min(maxScrollTop, container.scrollTop + deltaRatio * maxScrollTop)
      );
      syncBothScrolls(nextScrollTop, "project");
    },
    [timelineRef, syncBothScrolls]
  );

  return {
    activityScrollMetrics,
    projectScrollMetrics,
    isDraggingActivityMinimapViewport,
    setIsDraggingActivityMinimapViewport,
    isDraggingProjectMinimapViewport,
    setIsDraggingProjectMinimapViewport,
    handleActivityScroll,
    handleTimelineScroll,
    jumpActivityMinimapToRatio,
    dragActivityMinimapViewport,
    jumpProjectMinimapToRatio,
    dragProjectMinimapViewport,
  };
}
