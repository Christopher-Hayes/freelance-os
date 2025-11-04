import { NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import { Temporal } from "@js-temporal/polyfill";

interface RescueTimeRow {
  Date: string; // e.g., "2025-01-01T10:00:00"
  'Time Spent (seconds)': number;
  'Number of People': number;
  Activity: string;
  Category: string;
  Productivity: number; // -2 to 2
}

interface RescueTimeResponse {
  notes: string;
  row_headers: string[];
  rows: (string | number)[][];
}

// POST /api/activity-sessions/import-rescuetime
// Fetch activity data from RescueTime API and import it as activity sessions
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { date } = body; // YYYY-MM-DD format

    if (!date) {
      return NextResponse.json(
        { error: "Date parameter is required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    // Get RescueTime API key from settings
    const apiKeySetting = await prisma.setting.findUnique({
      where: { key: "rescuetime_api_key" },
    });

    if (!apiKeySetting || !apiKeySetting.value) {
      return NextResponse.json(
        { error: "RescueTime API key not configured. Please add it in Settings." },
        { status: 400 }
      );
    }

    const apiKey = apiKeySetting.value;

    // Build RescueTime API URL
    // We want document-level data (shows individual files/pages) with 5-minute granularity
    const rescueTimeUrl = new URL("https://www.rescuetime.com/anapi/data");
    rescueTimeUrl.searchParams.set("key", apiKey);
    rescueTimeUrl.searchParams.set("perspective", "interval");
    rescueTimeUrl.searchParams.set("restrict_kind", "document"); // Use 'document' for file-level detail
    rescueTimeUrl.searchParams.set("interval", "minute"); // 5-minute granularity
    rescueTimeUrl.searchParams.set("restrict_begin", date);
    rescueTimeUrl.searchParams.set("restrict_end", date);
    rescueTimeUrl.searchParams.set("format", "json");

    console.log("Fetching from RescueTime:", rescueTimeUrl.toString().replace(apiKey, "***"));

    // Fetch data from RescueTime
    const response = await fetch(rescueTimeUrl.toString());

    if (!response.ok) {
      const errorText = await response.text();
      console.error("RescueTime API error:", response.status, errorText);
      return NextResponse.json(
        { error: `RescueTime API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data: RescueTimeResponse = await response.json();

    // Log the response structure for debugging
    console.log("RescueTime API response headers:", data.row_headers);
    console.log("Sample row (first):", data.rows[0]);

    if (!data.rows || data.rows.length === 0) {
      return NextResponse.json({
        message: "No activity data found in RescueTime for this date",
        sessionsImported: 0,
      });
    }

    // Transform RescueTime data to our activity sessions format
    // RescueTime document-level rows format based on actual API response:
    // [Date, Time Spent (seconds), Number of People, Activity, Document, Category, Productivity]
    // Example: ["2025-10-30T18:00:00", 300, 1, "Visual Studio Code", "operatormenu.cs", "Editing & IDEs", 2]
    // The row_headers tell us the exact order:
    // - Index 0: Date
    // - Index 1: Time Spent (seconds)
    // - Index 2: Number of People
    // - Index 3: Activity (the application name)
    // - Index 4: Document (the specific file, page, or "No Details")
    // - Index 5: Category
    // - Index 6: Productivity
    
    const sessions = data.rows.map((row) => {
      const dateTime = row[0] as string; // ISO timestamp
      const durationSeconds = row[1] as number;
      
      // Row structure: Activity is at index 3, Document is at index 4
      const activity = row[3] as string; // Application name (e.g., "Visual Studio Code")
      const document = row[4] as string; // Document/file name (e.g., "operatormenu.cs" or "No Details")
      const category = row[5] as string; // Category (e.g., "Editing & IDEs")

      // Use document name as window title if it's meaningful (not "No Details"), otherwise use category
      const windowTitle = document && document !== "No Details" ? document : category;

      // Parse the start time
      const startTime = new Date(dateTime);
      
      // Calculate end time
      const endTime = new Date(startTime.getTime() + durationSeconds * 1000);

      return {
        startTime,
        endTime,
        appClass: activity, // The application name (e.g., "Visual Studio Code")
        windowTitle, // The document/file name or category
        durationSeconds,
      };
    });

    // Check if we already have data for this date to avoid duplicates
    const [year, month, day] = date.split('-').map(Number);
    const dayStart = new Date(Date.UTC(year!, month! - 1, day!, 0, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(year!, month! - 1, day!, 23, 59, 59, 999));

    const existingCount = await prisma.activitySession.count({
      where: {
        startTime: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
    });

    if (existingCount > 0) {
      return NextResponse.json({
        message: `Already have ${existingCount} activity sessions for this date. Delete existing sessions first if you want to re-import.`,
        sessionsImported: 0,
      });
    }

    // Bulk insert sessions
    await prisma.activitySession.createMany({
      data: sessions,
      skipDuplicates: true,
    });

    console.log(`Imported ${sessions.length} activity sessions from RescueTime for ${date}`);

    return NextResponse.json({
      message: `Successfully imported ${sessions.length} activity sessions from RescueTime`,
      sessionsImported: sessions.length,
    });
  } catch (error: any) {
    console.error("Error importing from RescueTime:", error);
    return NextResponse.json(
      { error: error.message || "Failed to import from RescueTime" },
      { status: 500 }
    );
  }
}
