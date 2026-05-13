import { NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import { createDAVClient, DAVCalendar } from "tsdav";
import { getAdminAuth, hasPermission } from "@/lib/auth";
import type { CalendarInfo } from "@/lib/webdav-provider";

// GET /api/caldav-providers/[id]/calendars — fetch live calendar list from one provider
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(authData, "read:settings")) {
      return NextResponse.json({ error: "Forbidden - Missing permission: read:settings" }, { status: 403 });
    }

    const { id } = await params;
    const providerId = parseInt(id, 10);
    if (isNaN(providerId)) {
      return NextResponse.json({ error: "Invalid provider ID" }, { status: 400 });
    }

    const provider = await prisma.calDavProvider.findUnique({ where: { id: providerId } });
    if (!provider) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    if (!provider.url || !provider.username || !provider.password) {
      return NextResponse.json({ error: "Provider is not fully configured" }, { status: 400 });
    }

    const client = await createDAVClient({
      serverUrl: provider.url,
      credentials: {
        username: provider.username,
        password: provider.password,
      },
      authMethod: "Basic",
      defaultAccountType: "caldav",
    });

    const calendars: DAVCalendar[] = await client.fetchCalendars();

    const results: CalendarInfo[] = calendars.map((cal) => ({
      url: cal.url,
      displayName: String(cal.displayName || "(Unnamed Calendar)"),
      description: cal.description ? String(cal.description) : null,
      color: (cal as any).calendarColor || null,
      providerId: provider.id,
      providerName: provider.name,
    }));

    return NextResponse.json({ calendars: results });
  } catch (error) {
    console.error("Error fetching calendars for provider:", error);
    return NextResponse.json({ error: "Failed to fetch calendars from CalDAV server" }, { status: 500 });
  }
}
