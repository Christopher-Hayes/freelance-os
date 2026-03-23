"use client";

import { Temporal } from "@/lib/temporal-polyfill";
import { useRef } from "react";
import { formatDateStr } from "./utils";

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
  const dateInputRef = useRef<HTMLInputElement>(null);

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

  const handleDatePickerClick = () => {
    dateInputRef.current?.showPicker?.();
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value && onDateSelect) {
      const [year, month, day] = e.target.value.split("-").map(Number);
      const newDate = Temporal.PlainDate.from({ year, month, day });
      onDateSelect(newDate);
    }
  };

  // Format date for input value (YYYY-MM-DD)
  const inputValue = formatDateStr(selectedDate);

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
      <div className="flex items-center justify-center gap-2">
        <div className="font-semibold text-gray-900 dark:text-gray-100">
          {formatDate(selectedDate)}
        </div>
        <div className="relative">
          <input
            ref={dateInputRef}
            type="date"
            value={inputValue}
            onChange={handleDateChange}
            className="absolute opacity-0 w-0 h-0 pointer-events-none"
            aria-label="Select date"
          />
          <button
            onClick={handleDatePickerClick}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            title="Pick a date"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
