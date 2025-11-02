"use client";

import { Temporal } from "@/lib/temporal-polyfill";
import { APP_COLORS } from "./utils";

const HOUR_HEIGHT = 60;

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
}

export default function ActivitySession({ session, position }: ActivitySessionProps) {
  const getAppColor = (appClass: string): string => {
    let hash = 0;
    for (let i = 0; i < appClass.length; i++) {
      hash = appClass.charCodeAt(i) + ((hash << 5) - hash);
    }
    return APP_COLORS[Math.abs(hash) % APP_COLORS.length]!;
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
  const end = Temporal.Instant.from(session.endTime).toZonedDateTimeISO(tz);
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
        <div className="flex flex-wrap text-xs truncate" style={{ color: appColor }}>
          {(height > 35 && session.windowTitle) ? (
            <>
              <div className="font-semibold truncate mb-0.5">{session.appClass}</div>
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
              <span className="font-semibold">{session.appClass}</span>
              <span className="text-[10px] opacity-70">
                {session.windowTitle ? ` - ${session.windowTitle.split(' / ').map(title => title.slice(0, title.indexOf(' - ') > 0 ? title.indexOf(' - ') : title.length)).join(' - ')}` : ''}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
