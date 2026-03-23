"use client";

import { useMemo, memo } from "react";
import { calculateActivityOverlaps } from "./overlapCalculations";
import ActivitySession from "./ActivitySession";
import TimelineHourMarkers from "./TimelineHourMarkers";
import {
  type ActivitySession as ActivitySessionType,
  mergeAdjacentSessions,
  buildAppColorMap,
} from "./utils";

interface ActivitySessionsTimelineProps {
  sessions: ActivitySessionType[];
  loading: boolean;
  onImportRescueTime: () => void;
  importingRescueTime: boolean;
  onSessionClick: (session: ActivitySessionType) => void;
  onSessionContextMenu: (event: React.MouseEvent<HTMLDivElement>, session: ActivitySessionType) => void;
}

// Memoized component for activity sessions timeline - only re-renders when sessions change
const ActivitySessionsTimeline = memo(function ActivitySessionsTimeline({
  sessions,
  loading,
  onImportRescueTime,
  importingRescueTime,
  onSessionClick,
  onSessionContextMenu,
}: ActivitySessionsTimelineProps) {
  // Memoize the merged sessions calculation
  const mergedSessions = useMemo(() => mergeAdjacentSessions(sessions), [sessions]);

  // Build color map based on app usage frequency
  const appColorMap = useMemo(() => buildAppColorMap(mergedSessions), [mergedSessions]);

  // Memoize the overlap calculations
  const activityOverlapPositions = useMemo(
    () => calculateActivityOverlaps(mergedSessions),
    [mergedSessions]
  );

  // Show empty state if no sessions and not loading
  if (!loading && sessions.length === 0) {
    return (
      <>
        <TimelineHourMarkers />
        <div className="sticky inset-0 flex items-center justify-center backdrop-blur-md p-8 max-w-[460px] top-[200px] left-[130px]">
          <div className="text-center space-y-4 p-6">
            <div className="text-gray-400 dark:text-gray-500">
              <svg
                className="w-16 h-16 mx-auto mb-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                No activity data yet
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                Import your activity from RescueTime
              </p>
            </div>
            <button
              onClick={onImportRescueTime}
              disabled={importingRescueTime}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600 dark:focus:ring-offset-slate-900"
            >
              {importingRescueTime ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Importing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Import from RescueTime
                </>
              )}
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <TimelineHourMarkers />
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-slate-900/60">
          <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
        </div>
      ) : (
        <div className="relative ml-12">
          {mergedSessions
            .filter((session) => activityOverlapPositions[session.id] !== undefined)
            .map((session) => (
              <ActivitySession
                key={session.id}
                session={session}
                position={activityOverlapPositions[session.id]!}
                colorMap={appColorMap}
                onClick={onSessionClick}
                onContextMenu={onSessionContextMenu}
              />
            ))}
        </div>
      )}
    </>
  );
});

export default ActivitySessionsTimeline;
