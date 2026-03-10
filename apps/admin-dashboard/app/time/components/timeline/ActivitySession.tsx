"use client";

import { memo, useMemo } from "react";
import { Temporal } from "@/lib/temporal-polyfill";
import {
  APP_COLORS,
  HOUR_HEIGHT,
  INTERVAL_BREAKDOWN_THRESHOLD_MINUTES,
  type SubSession,
  type IntervalBreakdown,
  computeIntervalBreakdown,
} from "./utils";
import { formatAppTitle } from "@/lib/util";

interface ActivitySession {
  id: number;
  startTime: string;
  endTime: string;
  appClass: string;
  windowTitle: string | null;
  durationSeconds: number;
  subSessions?: SubSession[];
}

interface ActivitySessionProps {
  session: ActivitySession;
  position: { column: number; totalColumns: number; columnSpan?: number };
  colorMap: Map<string, string>;
}

// Memoized component - only re-renders if session or position changes
const ActivitySession = memo(function ActivitySession({ session, position, colorMap }: ActivitySessionProps) {
  const getAppColor = (appClass: string): string => {
    // Use the color map if available, otherwise fall back to hash-based color
    return colorMap.get(appClass) || APP_COLORS[0]!;
  };

  const timeToY = (time: Temporal.ZonedDateTime): number => {
    const startOfDay = time.withPlainTime(Temporal.PlainTime.from("00:00"));
    const diffNs = time.epochNanoseconds - startOfDay.epochNanoseconds;
    const diffMs = Number(diffNs / 1_000_000n);
    const totalHours = diffMs / (1000 * 60 * 60);
    return totalHours * HOUR_HEIGHT;
  };

  const tz = Temporal.Now.timeZoneId();
  const start = Temporal.Instant.from(session.startTime).toZonedDateTimeISO(tz);
  let end = Temporal.Instant.from(session.endTime).toZonedDateTimeISO(tz);

  // Clamp end time to same day as start to prevent cross-midnight rendering issues
  const endOfDay = start.withPlainTime(Temporal.PlainTime.from("23:59:59.999"));
  if (Temporal.ZonedDateTime.compare(end, endOfDay) > 0) {
    end = endOfDay;
  }

  const top = timeToY(start);
  const bottom = timeToY(end);
  const height = bottom - top;

  const durationMinutes = session.durationSeconds / 60;
  const hasMultipleSubSessions = session.subSessions && session.subSessions.length > 1;
  const useIntervalUI = durationMinutes >= INTERVAL_BREAKDOWN_THRESHOLD_MINUTES && hasMultipleSubSessions;

  // Compute interval breakdowns (memoized)
  const intervals = useMemo(() => {
    if (!useIntervalUI || !session.subSessions) return [];
    return computeIntervalBreakdown(session.startTime, session.endTime, session.subSessions);
  }, [useIntervalUI, session.startTime, session.endTime, session.subSessions]);

  // Use columnSpan if provided, otherwise default to spanning 1 column
  const spanColumns = position.columnSpan ?? 1;
  const widthPercent = (spanColumns / position.totalColumns) * 100;
  const leftPercent = (position.column / position.totalColumns) * 100;
  const gap = position.totalColumns > 1 ? 1 : 0;

  const appColor = getAppColor(session.appClass);

  // Render the interval breakdown UI for long merged sessions
  if (useIntervalUI && intervals.length > 0) {
    return (
      <div
        className="timeline-session absolute z-10 border backdrop-blur-sm rounded overflow-hidden cursor-help"
        style={{
          top: `${top}px`,
          height: `${height}px`,
          minHeight: "2px",
          left: `calc(${leftPercent}% + ${gap}px)`,
          right: `calc(${100 - leftPercent - widthPercent}% + ${gap}px)`,
          backgroundColor: `${appColor}20`,
          borderColor: appColor,
        }}
        title={`${session.appClass}\n${Math.round(durationMinutes)} min`}
      >
        {/* App title header */}
        <div
          className="px-1.5 pt-0.5 text-white text-xs font-semibold truncate border-b"
          style={{
            backgroundColor: appColor,
            borderColor: appColor,
          }}
        >
          {formatAppTitle(session.appClass)}
        </div>

        <div className="relative mt-0.75 flex flex-col gap-px" style={{ borderColor: appColor }}>
          {/* 15-minute interval markers */}
          {intervals.map((interval, index) => {
            return (
              <div
                key={index}
                className="relative flex items-start"
              >
                {/* if this interval shows the same title as the previous, show an blank placeholder */}
                {index > 0 && intervals[index - 1]?.title === interval.title ? (
                  <div className="w-4 h-3.5">
                  </div>
                ) : (
                  <div
                    className="max-h-3.5 relative pl-3 w-full flex items-center gap-1.5"
                  >
                    {/* horizontal line connecting to left border */}
                    <span className="absolute top-1.75 left-0 w-2 border-b"
                      style={{ borderColor: appColor }}
                    />
                    <span
                      className="text-[9px] opacity-60 whitespace-nowrap"
                      style={{ color: appColor }}
                    >
                      {interval.timeLabel}
                    </span>
                    <span
                      className="text-[10px] truncate opacity-90"
                      style={{ color: appColor }}
                    >
                      {interval.title}
                      {/* If the next session has the same title, show the title again below but semi-transparent to indicate continuation */}
                      {index < intervals.length - 1 && intervals[index + 1]?.title === interval.title && (
                        <div
                          className="absolute top-3.25 text-[10px] opacity-50 truncate mt-0.5"
                          style={{ color: appColor }}
                        >
                          {interval.title}
                        </div>
                      )}
                      {/* if the session after that has the same title, show again with decreased opacity to indicate continuation */}
                      {index < intervals.length - 2 &&
                        intervals[index + 1]?.title === interval.title &&
                        intervals[index + 2]?.title === interval.title && (
                        <div
                          className="absolute top-7 text-[10px] opacity-20 truncate mt-0.5"
                          style={{ color: appColor }}
                        >
                          {interval.title}
                        </div>
                      )}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const formattedAppTitle = formatAppTitle(session.appClass);

  // Default rendering for short sessions
  return (
    <div
      className={`timeline-session absolute z-10 flex ${height > 35 ? 'items-start' : 'items-center'} border backdrop-blur-sm rounded pr-1 overflow-hidden cursor-help`}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        minHeight: "2px",
        left: `calc(${leftPercent}% + ${gap}px)`,
        right: `calc(${100 - leftPercent - widthPercent}% + ${gap}px)`,
        backgroundColor: `${appColor}20`,
        borderColor: appColor,
      }}
      title={`${session.appClass}\n${session.windowTitle || ""}\n${Math.round(durationMinutes)} min`}
    >
      {height > 10 && (
        <div className="h-full flex items-center text-xs" style={{ color: appColor }}>
          {(height > 35 && session.windowTitle) ? (
            <>
              <div className="font-semibold truncate mb-0.5">{formattedAppTitle}</div>
              <div className="w-full text-[10px] opacity-80">
                {session.windowTitle.split(' / ').map((title, index) => (
                  <div key={index} className="truncate">
                    {title.slice(0, title.lastIndexOf(' - ') > 0 ? title.lastIndexOf(' - ') : title.length)}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-full truncate flex items-center">
              <div
                className="h-full flex items-center px-1 pt-px font-semibold text-white"
                style={{
                  backgroundColor: appColor,
                }}
                >
                <span>{formattedAppTitle}</span>
              </div>
              <span className="pl-1 text-[10px] opacity-90">
                {session.windowTitle &&
                  session.windowTitle !== formattedAppTitle
                  ? `${session.windowTitle.split(' / ').map(title => title.slice(0, title.indexOf(' - ') > 0 ? title.indexOf(' - ') : title.length)).join(' - ')}` : ''}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default ActivitySession;
