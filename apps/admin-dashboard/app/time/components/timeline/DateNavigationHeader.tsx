"use client";

import { Temporal } from "@/lib/temporal-polyfill";

interface DateNavigationHeaderProps {
  selectedDate: Temporal.PlainDate;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
}

export default function DateNavigationHeader({
  selectedDate,
  onPrevDay,
  onNextDay,
  onToday,
}: DateNavigationHeaderProps) {
  const formatDate = (date: Temporal.PlainDate) => {
    const jsDate = new Date(date.year, date.month - 1, date.day);
    return jsDate.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const isToday = (date: Temporal.PlainDate) => {
    const today = Temporal.Now.plainDateISO();
    return date.year === today.year && 
           date.month === today.month && 
           date.day === today.day;
  };

  return (
    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={onPrevDay}
          className="px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded text-sm"
        >
          ← Prev
        </button>
        <button
          onClick={onToday}
          className={`px-3 py-1 rounded text-sm font-medium ${
            isToday(selectedDate)
              ? "bg-blue-600 text-white"
              : "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100"
          }`}
        >
          Today
        </button>
        <button
          onClick={onNextDay}
          className="px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded text-sm"
        >
          Next →
        </button>
      </div>
      <div className="text-center font-semibold text-gray-900 dark:text-gray-100">
        {formatDate(selectedDate)}
      </div>
    </div>
  );
}
