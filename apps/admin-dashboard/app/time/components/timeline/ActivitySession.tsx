"use client";

import { memo } from "react";
import { Temporal } from "@/lib/temporal-polyfill";
import { APP_COLORS, HOUR_HEIGHT } from "./utils";
import { formatAppTitle } from "@/lib/util";

interface ActivitySession {
  id: number;
  startTime: string;
  endTime: string;
  appClass: string;
  windowTitle: string | null;
  durationSeconds: number;
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
  // Timeline only shows 24 hours per day (00:00 - 23:59:59.999)
  const endOfDay = start.withPlainTime(Temporal.PlainTime.from("23:59:59.999"));
  if (Temporal.ZonedDateTime.compare(end, endOfDay) > 0) {
    end = endOfDay;
  }
  
  const top = timeToY(start);
  const bottom = timeToY(end);
  const height = bottom - top;

  // Use columnSpan if provided, otherwise default to spanning 1 column
  const spanColumns = position.columnSpan ?? 1;
  const widthPercent = (spanColumns / position.totalColumns) * 100;
  const leftPercent = (position.column / position.totalColumns) * 100;
  const gap = position.totalColumns > 1 ? 1 : 0;

  const appColor = getAppColor(session.appClass);

  return (
    <div
      className={`timeline-session absolute z-10 flex ${height > 35 ? 'items-start' : 'items-center'} border rounded px-1 overflow-hidden cursor-help`}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        minHeight: "2px",
        left: `calc(${leftPercent}% + ${gap}px)`,
        right: `calc(${100 - leftPercent - widthPercent}% + ${gap}px)`,
        backgroundColor: `${appColor}20`,
        borderColor: appColor,
      }}
      title={`${session.appClass}\n${session.windowTitle || ""}\n${Math.round(session.durationSeconds / 60)} min`}
    >
      {height > 10 && (
        <div className="flex flex-wrap text-xs" style={{ color: appColor }}>
          {(height > 35 && session.windowTitle) ? (
            <>
              <div className="font-semibold truncate mb-0.5">{formatAppTitle(session.appClass)}</div>
              <div className="w-full text-[10px] opacity-80">
                {session.windowTitle.split(' / ').map((title, index) => (
                  <div key={index} className="truncate">
                    {title.slice(0, title.lastIndexOf(' - ') > 0 ? title.lastIndexOf(' - ') : title.length)}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="truncate">
              <span className="font-semibold">{formatAppTitle(session.appClass)}</span>
              <span className="text-[10px] opacity-70">
                {session.windowTitle ? ` - ${session.windowTitle.split(' / ').map(title => title.slice(0, title.indexOf(' - ') > 0 ? title.indexOf(' - ') : title.length)).join(' - ')}` : ''}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default ActivitySession;
