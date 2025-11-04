interface TimeEntry {
  id: number;
  projectName: string;
  description: string | null;
  startTime: string;
  durationHours: number;
  billable: boolean;
}

interface RecentTimeEntriesProps {
  entries: TimeEntry[];
}

export function RecentTimeEntries({ entries }: RecentTimeEntriesProps) {
  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  };

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Recent Time Entries
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">
          No time entries yet
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Recent Time Entries
      </h2>
      <div className="space-y-3">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-gray-900 dark:text-white">
                  {entry.projectName}
                </h3>
                {entry.billable && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                    Billable
                  </span>
                )}
              </div>
              {entry.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {entry.description}
                </p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                {formatDate(entry.startTime)}
              </p>
            </div>
            <div className="text-right ml-4">
              <p className="font-semibold text-gray-900 dark:text-white">
                {entry.durationHours}h
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
