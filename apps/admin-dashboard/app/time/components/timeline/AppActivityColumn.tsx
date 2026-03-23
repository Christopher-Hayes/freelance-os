"use client";

import React from "react";
import { Temporal } from "@/lib/temporal-polyfill";
import { OptionsMenu, OptionsMenuItem, OptionsMenuSeparator } from "@repo/ui";
import ActivitySessionsTimeline from "./ActivitySessionsTimeline";
import ActivityScrollbarMinimap from "./ActivityScrollbarMinimap";
import CurrentTimeLine from "./CurrentTimeLine";
import { HOUR_HEIGHT, TIMELINE_PADDING_TOP, type ActivitySession as ActivitySessionType } from "./utils";

interface ScrollMetrics {
  scrollTop: number;
  viewportHeight: number;
  scrollHeight: number;
}

interface AppActivityColumnProps {
  // Data
  sessions: ActivitySessionType[];
  visibleSessions: ActivitySessionType[];
  mergedVisibleSessions: ActivitySessionType[];
  minimapColorMap: Map<string, string>;
  loading: boolean;
  timeAgo: string;
  importingRescueTime: boolean;
  mergingRescueTimeActivity: boolean;
  // Scroll/minimap state
  activityScrollMetrics: ScrollMetrics;
  isDraggingActivityMinimapViewport: boolean;
  setIsDraggingActivityMinimapViewport: (v: boolean) => void;
  // Timeline display
  isClient: boolean;
  selectedDate: Temporal.PlainDate;
  currentTime: Temporal.ZonedDateTime;
  // Handlers
  onRefresh: () => void;
  onMergeRescueTimeActivity: () => void;
  onDeleteDayActivity: () => void;
  onImportFromRescueTime: () => void;
  onSessionClick: (session: ActivitySessionType) => void;
  onSessionContextMenu: (event: React.MouseEvent<HTMLDivElement>, session: ActivitySessionType) => void;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  onJumpMinimapToRatio: (ratio: number) => void;
  onDragMinimap: (deltaRatio: number) => void;
  // Ref
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

export default function AppActivityColumn({
  sessions,
  visibleSessions,
  mergedVisibleSessions,
  minimapColorMap,
  loading,
  timeAgo,
  importingRescueTime,
  mergingRescueTimeActivity,
  activityScrollMetrics,
  isDraggingActivityMinimapViewport,
  setIsDraggingActivityMinimapViewport,
  isClient,
  selectedDate,
  currentTime,
  onRefresh,
  onMergeRescueTimeActivity,
  onDeleteDayActivity,
  onImportFromRescueTime,
  onSessionClick,
  onSessionContextMenu,
  onScroll,
  onJumpMinimapToRatio,
  onDragMinimap,
  scrollRef,
}: AppActivityColumnProps) {
  return (
    <div className="col-span-3 select-none">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            App Activity
          </h3>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200"
            title="Refresh activity data"
          >
            <svg
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
          {timeAgo && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Updated {timeAgo}
            </span>
          )}
        </div>
        <OptionsMenu label="App Activity options">
          <OptionsMenuItem
            onClick={onMergeRescueTimeActivity}
            disabled={mergingRescueTimeActivity}
            icon={
              mergingRescueTimeActivity ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              )
            }
          >
            {mergingRescueTimeActivity ? "Merging..." : "Merge RescueTime app activity"}
          </OptionsMenuItem>
          <OptionsMenuSeparator />
          <OptionsMenuItem
            onClick={onDeleteDayActivity}
            disabled={loading || sessions.length === 0}
            tone="danger"
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            }
          >
            Delete today&apos;s app activity
          </OptionsMenuItem>
        </OptionsMenu>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white/70 dark:border-white/10 dark:bg-slate-950/30">
        <div className="flex h-full items-stretch">
          <div
            ref={scrollRef}
            className="relative min-w-0 flex-1 overflow-y-auto overflow-x-visible pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ height: `${24 * HOUR_HEIGHT + 40}px`, maxHeight: "640px" }}
            onScroll={onScroll}
          >
            <div
              className="relative"
              style={{
                height: `${24 * HOUR_HEIGHT + 40}px`,
                paddingTop: `${TIMELINE_PADDING_TOP}px`,
                paddingBottom: "40px",
              }}
            >
              <ActivitySessionsTimeline
                sessions={visibleSessions}
                loading={loading}
                onImportRescueTime={onImportFromRescueTime}
                importingRescueTime={importingRescueTime}
                onSessionClick={onSessionClick}
                onSessionContextMenu={onSessionContextMenu}
              />
              <CurrentTimeLine
                selectedDate={selectedDate}
                isClient={isClient}
                currentTime={currentTime}
              />
            </div>
          </div>
          <ActivityScrollbarMinimap
            sessions={mergedVisibleSessions}
            colorMap={minimapColorMap}
            scrollTop={activityScrollMetrics.scrollTop}
            viewportHeight={activityScrollMetrics.viewportHeight}
            scrollHeight={activityScrollMetrics.scrollHeight}
            onJumpToRatio={onJumpMinimapToRatio}
            onDragViewport={onDragMinimap}
            isDraggingViewport={isDraggingActivityMinimapViewport}
            setIsDraggingViewport={setIsDraggingActivityMinimapViewport}
          />
        </div>
      </div>
    </div>
  );
}
