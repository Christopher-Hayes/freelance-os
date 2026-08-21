"use client";

import { Temporal } from "@/lib/temporal-polyfill";
import DatePickerCalendar from "./DatePickerCalendar";

interface DateNavigationHeaderProps {
  selectedDate: Temporal.PlainDate;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  onDateSelect?: (date: Temporal.PlainDate) => void;
}

export default function DateNavigationHeader({
  selectedDate,
  onPrevDay,
  onNextDay,
  onToday,
  onDateSelect,
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
        <div className="flex items-center gap-2">
          <button
            onClick={onPrevDay}
            className="px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded font-medium text-sm"
          >
            ← Prev
          </button>
          {/* if today is before selected date, show today button on left */}
          {Temporal.PlainDate.compare(Temporal.Now.plainDateISO(), selectedDate) < 0 && (
            <button
              onClick={onToday}
              className={`px-3 py-1 rounded text-sm font-medium ${isToday(selectedDate)
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100"
                }`}
            >
              Today
            </button>
          )}
        </div>
        <div className="flex items-center justify-center gap-2">
          <div className="font-semibold text-gray-900 dark:text-gray-100">
            {formatDate(selectedDate)}
          </div>
          {onDateSelect && (
            <DatePickerCalendar selectedDate={selectedDate} onDateSelect={onDateSelect} />
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* if today is before selected date, show today button on right */}
          {Temporal.PlainDate.compare(Temporal.Now.plainDateISO(), selectedDate) > 0 && (
            <button
              onClick={onToday}
              className={`px-3 py-1 rounded text-sm font-medium ${isToday(selectedDate)
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100"
                }`}
            >
              Today
            </button>
          )}
          <button
            onClick={onNextDay}
            className="px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded font-medium text-sm"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
