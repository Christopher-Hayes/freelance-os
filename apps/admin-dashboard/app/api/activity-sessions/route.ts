import { NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import { Temporal } from "@js-temporal/polyfill";
import { getAdminAuth, hasPermission } from "@/lib/auth";

// GET /api/activity-sessions - List activity sessions for a specific date
export async function GET(request: Request) {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

		if (!hasPermission(authData, "read:activity")) {
			return NextResponse.json({ error: "Forbidden - Missing permission: read:activity" }, { status: 403 });
		}

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");

    if (!date) {
      return NextResponse.json(
        { error: "Date parameter is required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    // Parse the date as a LOCAL day using Temporal.
    // RescueTime timestamps are stored as UTC instants derived from local time,
    // so we query the local-day boundaries converted to UTC.
    const plainDate = Temporal.PlainDate.from(date);
    const localTz = Temporal.Now.timeZoneId();
    const startOfDay = new Date(plainDate.toZonedDateTime(localTz).toInstant().epochMilliseconds);
    const endOfDay = new Date(
      plainDate.toZonedDateTime({ timeZone: localTz, plainTime: Temporal.PlainTime.from('23:59:59.999') }).toInstant().epochMilliseconds
    );

    const sessions = await prisma.activitySession.findMany({
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

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("Error fetching activity sessions:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity sessions" },
      { status: 500 }
    );
  }
}
