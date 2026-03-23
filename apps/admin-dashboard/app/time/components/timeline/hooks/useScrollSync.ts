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
  calendarScrollMetrics: ScrollMetrics;
  isDraggingActivityMinimapViewport: boolean;
  setIsDraggingActivityMinimapViewport: React.Dispatch<React.SetStateAction<boolean>>;
  isDraggingProjectMinimapViewport: boolean;
  setIsDraggingProjectMinimapViewport: React.Dispatch<React.SetStateAction<boolean>>;
  isDraggingCalendarMinimapViewport: boolean;
  setIsDraggingCalendarMinimapViewport: React.Dispatch<React.SetStateAction<boolean>>;
  handleActivityScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  handleTimelineScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  handleCalendarScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  jumpActivityMinimapToRatio: (ratio: number) => void;
  dragActivityMinimapViewport: (deltaRatio: number) => void;
  jumpProjectMinimapToRatio: (ratio: number) => void;
  dragProjectMinimapViewport: (deltaRatio: number) => void;
  jumpCalendarMinimapToRatio: (ratio: number) => void;
  dragCalendarMinimapViewport: (deltaRatio: number) => void;
}

const DEFAULT_SCROLL_HEIGHT = 24 * HOUR_HEIGHT + 40;

export function useScrollSync(
  activityScrollRef: React.RefObject<HTMLDivElement | null>,
  timelineRef: React.RefObject<HTMLDivElement | null>,
  selectedDate: unknown, // used as dependency trigger
  loading: boolean,
  mergedVisibleSessions: ActivitySession[],
  calendarScrollRef?: React.RefObject<HTMLDivElement | null>,
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
  const [calendarScrollMetrics, setCalendarScrollMetrics] = useState<ScrollMetrics>({
    scrollTop: 0,
    viewportHeight: MINIMAP_HEIGHT_PX,
    scrollHeight: DEFAULT_SCROLL_HEIGHT,
  });

  const [isDraggingActivityMinimapViewport, setIsDraggingActivityMinimapViewport] = useState(false);
  const [isDraggingProjectMinimapViewport, setIsDraggingProjectMinimapViewport] = useState(false);
  const [isDraggingCalendarMinimapViewport, setIsDraggingCalendarMinimapViewport] = useState(false);

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

  // ── Sync all columns helper ──────────────────────────────────────────

  const syncAllScrolls = useCallback(
    (nextScrollTop: number, source: "activity" | "project" | "calendar") => {
      const activityContainer = activityScrollRef.current;
      const projectContainer = timelineRef.current;
      const calendarContainer = calendarScrollRef?.current;

      // Set scrollTop on all containers except the source
      if (source !== "activity" && activityContainer) activityContainer.scrollTop = nextScrollTop;
      if (source !== "project" && projectContainer) projectContainer.scrollTop = nextScrollTop;
      if (source !== "calendar" && calendarContainer) calendarContainer.scrollTop = nextScrollTop;

      // Update all metrics
      if (activityContainer) {
        const metrics = source === "activity"
          ? { scrollTop: nextScrollTop, viewportHeight: activityContainer.clientHeight, scrollHeight: activityContainer.scrollHeight }
          : { scrollTop: nextScrollTop, viewportHeight: activityContainer.clientHeight, scrollHeight: activityContainer.scrollHeight };
        setActivityScrollMetrics(metrics);
      } else {
        setActivityScrollMetrics((prev) => ({ ...prev, scrollTop: nextScrollTop }));
      }

      if (projectContainer) {
        setProjectScrollMetrics({
          scrollTop: nextScrollTop,
          viewportHeight: projectContainer.clientHeight,
          scrollHeight: projectContainer.scrollHeight,
        });
      } else {
        setProjectScrollMetrics((prev) => ({ ...prev, scrollTop: nextScrollTop }));
      }

      if (calendarContainer) {
        setCalendarScrollMetrics({
          scrollTop: nextScrollTop,
          viewportHeight: calendarContainer.clientHeight,
          scrollHeight: calendarContainer.scrollHeight,
        });
      } else {
        setCalendarScrollMetrics((prev) => ({ ...prev, scrollTop: nextScrollTop }));
      }
    },
    [activityScrollRef, timelineRef, calendarScrollRef]
  );

  // ── Scroll handlers ──────────────────────────────────────────────────

  const handleActivityScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      syncAllScrolls(e.currentTarget.scrollTop, "activity");
    },
    [syncAllScrolls]
  );

  const handleTimelineScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      syncAllScrolls(e.currentTarget.scrollTop, "project");
    },
    [syncAllScrolls]
  );

  const handleCalendarScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      syncAllScrolls(e.currentTarget.scrollTop, "calendar");
    },
    [syncAllScrolls]
  );

  // ── Minimap jump/drag helpers ────────────────────────────────────────

  const jumpActivityMinimapToRatio = useCallback(
    (ratio: number) => {
      const container = activityScrollRef.current;
      if (!container) return;
      const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0);
      const nextScrollTop = Math.max(0, Math.min(maxScrollTop, ratio * maxScrollTop));
      syncAllScrolls(nextScrollTop, "activity");
    },
    [activityScrollRef, syncAllScrolls]
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
      syncAllScrolls(nextScrollTop, "activity");
    },
    [activityScrollRef, syncAllScrolls]
  );

  const jumpProjectMinimapToRatio = useCallback(
    (ratio: number) => {
      const container = timelineRef.current;
      if (!container) return;
      const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0);
      const nextScrollTop = Math.max(0, Math.min(maxScrollTop, ratio * maxScrollTop));
      syncAllScrolls(nextScrollTop, "project");
    },
    [timelineRef, syncAllScrolls]
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
      syncAllScrolls(nextScrollTop, "project");
    },
    [timelineRef, syncAllScrolls]
  );

  const jumpCalendarMinimapToRatio = useCallback(
    (ratio: number) => {
      const container = calendarScrollRef?.current;
      if (!container) return;
      const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0);
      const nextScrollTop = Math.max(0, Math.min(maxScrollTop, ratio * maxScrollTop));
      syncAllScrolls(nextScrollTop, "calendar");
    },
    [calendarScrollRef, syncAllScrolls]
  );

  const dragCalendarMinimapViewport = useCallback(
    (deltaRatio: number) => {
      const container = calendarScrollRef?.current;
      if (!container) return;
      const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0);
      const nextScrollTop = Math.max(
        0,
        Math.min(maxScrollTop, container.scrollTop + deltaRatio * maxScrollTop)
      );
      syncAllScrolls(nextScrollTop, "calendar");
    },
    [calendarScrollRef, syncAllScrolls]
  );

  return {
    activityScrollMetrics,
    projectScrollMetrics,
    calendarScrollMetrics,
    isDraggingActivityMinimapViewport,
    setIsDraggingActivityMinimapViewport,
    isDraggingProjectMinimapViewport,
    setIsDraggingProjectMinimapViewport,
    isDraggingCalendarMinimapViewport,
    setIsDraggingCalendarMinimapViewport,
    handleActivityScroll,
    handleTimelineScroll,
    handleCalendarScroll,
    jumpActivityMinimapToRatio,
    dragActivityMinimapViewport,
    jumpProjectMinimapToRatio,
    dragProjectMinimapViewport,
    jumpCalendarMinimapToRatio,
    dragCalendarMinimapViewport,
  };
}
