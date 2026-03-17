import { NextResponse } from 'next/server';
import { prisma } from '@freelance-os/database';

async function getHiddenAppClasses(): Promise<Set<string>> {
  const hiddenApps = await prisma.app.findMany({
    where: { hidden: true },
    select: { appClass: true },
  });

  return new Set(hiddenApps.map((app) => app.appClass.toLowerCase()));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Default to last 30 days if no dates provided
    const end = endDate ? new Date(endDate) : new Date();
    // Make end date inclusive by setting to end of day
    end.setHours(23, 59, 59, 999);
    
    const start = startDate 
      ? new Date(startDate) 
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    const hiddenAppClasses = await getHiddenAppClasses();

    // Query activity sessions within date range
    const sessions = await prisma.activitySession.findMany({
      where: {
        startTime: {
          gte: start,
          lte: end,
        },
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    const visibleSessions = sessions.filter(
      (session) => !hiddenAppClasses.has((session.appClass || 'Unknown').toLowerCase())
    );

    // Group by date and app_class
    const dailyActivity: Record<string, Record<string, number>> = {};
    const appTotals: Record<string, number> = {};

  visibleSessions.forEach((session) => {
      const dateKey = session.startTime.toISOString().split('T')[0] || '';
      const app = session.appClass || 'Unknown';
      const hours = session.durationSeconds / 3600;

      // Daily breakdown
      if (!dailyActivity[dateKey]) {
        dailyActivity[dateKey] = {};
      }
      dailyActivity[dateKey][app] = (dailyActivity[dateKey][app] || 0) + hours;

      // App totals
      appTotals[app] = (appTotals[app] || 0) + hours;
    });

    // Convert to arrays for easier frontend consumption
    const dailyData = Object.entries(dailyActivity).map(([date, apps]) => ({
      date,
      totalHours: Object.values(apps).reduce((sum, h) => sum + h, 0),
      apps,
    }));

    const topApps = Object.entries(appTotals)
      .map(([app, hours]) => ({ app, hours }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10);

    return NextResponse.json({
      dailyData,
      topApps,
  totalSessions: visibleSessions.length,
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching activity data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activity data' },
      { status: 500 }
    );
  }
}
