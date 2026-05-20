import { NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import { Temporal } from "@js-temporal/polyfill";
import { getAdminAuth, hasPermission } from "@/lib/auth";

export async function GET(request: Request) {
  const authData = await getAdminAuth();
  if (!authData) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(authData, "read:time")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const startDateStr = searchParams.get("startDate");
  const endDateStr = searchParams.get("endDate");

  if (!startDateStr || !endDateStr) {
    return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 });
  }

  const timeZone = Temporal.Now.timeZoneId();
  const startDate = Temporal.PlainDate.from(startDateStr);
  const endDate = Temporal.PlainDate.from(endDateStr);

  if (Temporal.PlainDate.compare(startDate, endDate) > 0) {
    return NextResponse.json({ missingDays: [] });
  }

  // Collect all weekdays in the range (guard against very large ranges)
  const dayDiff = startDate.until(endDate, { largestUnit: "days" }).days;
  if (dayDiff > 366) {
    return NextResponse.json({ missingDays: [] });
  }

  const weekdays: Temporal.PlainDate[] = [];
  let cursor = startDate;
  while (Temporal.PlainDate.compare(cursor, endDate) <= 0) {
    if (cursor.dayOfWeek <= 5) {
      weekdays.push(cursor);
    }
    cursor = cursor.add({ days: 1 });
  }

  if (weekdays.length === 0) {
    return NextResponse.json({ missingDays: [] });
  }

  // Compute each weekday's 8am–8pm window in UTC so we can test overlap
  type DayWindow = { dateStr: string; windowStart: Date; windowEnd: Date };
  const dayWindows: DayWindow[] = weekdays.map((day) => ({
    dateStr: day.toString(),
    windowStart: new Date(
      day.toZonedDateTime({ timeZone, plainTime: Temporal.PlainTime.from("08:00:00") }).toInstant().epochMilliseconds
    ),
    windowEnd: new Date(
      day.toZonedDateTime({ timeZone, plainTime: Temporal.PlainTime.from("20:00:00") }).toInstant().epochMilliseconds
    ),
  }));

  // Fetch entries that could overlap any window: endTime > first window start AND startTime < last window end.
  // This correctly includes entries that start before 8am but extend into the window.
  const overallWindowStart = dayWindows[0]!.windowStart;
  const overallWindowEnd = dayWindows[dayWindows.length - 1]!.windowEnd;

  const entries = await prisma.timeEntry.findMany({
    where: {
      endTime: { gt: overallWindowStart },
      startTime: { lt: overallWindowEnd },
    },
    select: { startTime: true, endTime: true },
  });

  // A day has coverage if any entry overlaps its 8am–8pm window:
  //   entry.startTime < windowEnd  AND  entry.endTime > windowStart
  const datesWithEntries = new Set<string>();
  for (const window of dayWindows) {
    for (const entry of entries) {
      if (entry.startTime < window.windowEnd && entry.endTime > window.windowStart) {
        datesWithEntries.add(window.dateStr);
        break;
      }
    }
  }

  const missingDays = weekdays
    .filter((day) => !datesWithEntries.has(day.toString()))
    .map((day) => day.toString());

  return NextResponse.json({ missingDays });
}
