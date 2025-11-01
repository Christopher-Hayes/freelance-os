import { NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";

// GET /api/activity-sessions - List activity sessions for a specific date
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");

    if (!date) {
      return NextResponse.json(
        { error: "Date parameter is required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    // Parse the date string (YYYY-MM-DD) as a local date
    // Since we don't have timezone info from the client, we need to query a wider range
    // The date "2025-10-31" could span from Oct 31 00:00 in UTC+14 to Oct 31 23:59 in UTC-12
    // That's roughly Oct 30 10:00 UTC to Nov 01 11:59 UTC (a ~38 hour window)
    // We'll be conservative and query +/- 24 hours, then filter in-memory
    const [year, month, day] = date.split('-').map(Number);
    
    // Create date in UTC for the query range
    const queryDate = new Date(Date.UTC(year!, month! - 1, day!, 0, 0, 0, 0));
    const startOfDay = new Date(queryDate);
    startOfDay.setUTCHours(startOfDay.getUTCHours() - 24); // 24 hours before
    
    const endOfDay = new Date(queryDate);
    endOfDay.setUTCHours(endOfDay.getUTCHours() + 48); // 48 hours after (covers +24h)

    const allSessions = await prisma.activitySession.findMany({
      where: {
        startTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: {
        startTime: "asc",
      },
    });

    // Filter sessions to only those whose LOCAL date matches the requested date
    // This handles timezone conversion properly
    const sessions = allSessions.filter((session) => {
      const localStart = new Date(session.startTime);
      const localYear = localStart.getFullYear();
      const localMonth = localStart.getMonth() + 1;
      const localDay = localStart.getDate();
      
      return localYear === year && localMonth === month && localDay === day;
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("Error fetching activity sessions:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity sessions" },
      { status: 500 }
    );
  }
}
