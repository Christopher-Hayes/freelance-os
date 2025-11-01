import { NextResponse } from 'next/server';
import { prisma } from '@freelance-os/database';

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

    // Get sessions in date range
    const sessions = await prisma.activitySession.findMany({
      where: {
        startTime: {
          gte: start,
          lte: end,
        },
      },
    });

    // Calculate summary statistics
    const totalDurationSeconds = sessions.reduce(
      (sum, session) => sum + session.durationSeconds,
      0
    );
    const totalHours = totalDurationSeconds / 3600;

    // Find most used app
    const appCounts: Record<string, { duration: number; sessions: number }> = {};
    sessions.forEach((session) => {
      const app = session.appClass || 'Unknown';
      if (!appCounts[app]) {
        appCounts[app] = { duration: 0, sessions: 0 };
      }
      appCounts[app].duration += session.durationSeconds / 3600;
      appCounts[app].sessions += 1;
    });

    const mostUsedApp = Object.entries(appCounts)
      .sort((a, b) => b[1].duration - a[1].duration)[0];

    // Calculate weekly breakdown
    const weeks: Record<string, number> = {};
    sessions.forEach((session) => {
      const weekStart = getWeekStart(session.startTime);
      const weekKey = weekStart.toISOString().split('T')[0] || '';
      weeks[weekKey] = (weeks[weekKey] || 0) + session.durationSeconds / 3600;
    });

    const weeklyData = Object.entries(weeks)
      .map(([week, hours]) => ({ week, hours }))
      .sort((a, b) => a.week.localeCompare(b.week));

    // Average daily hours
    const dayCount = Math.max(
      1,
      Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
    );
    const avgDailyHours = totalHours / dayCount;

    return NextResponse.json({
      totalHours: parseFloat(totalHours.toFixed(2)),
      totalSessions: sessions.length,
      avgDailyHours: parseFloat(avgDailyHours.toFixed(2)),
      mostUsedApp: mostUsedApp
        ? {
            name: mostUsedApp[0],
            hours: parseFloat(mostUsedApp[1].duration.toFixed(2)),
            sessions: mostUsedApp[1].sessions,
          }
        : null,
      weeklyData,
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching activity summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activity summary' },
      { status: 500 }
    );
  }
}

// Helper function to get the start of the week (Monday)
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust if Sunday
  return new Date(d.setDate(diff));
}
