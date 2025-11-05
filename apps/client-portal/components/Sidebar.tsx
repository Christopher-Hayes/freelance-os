"use client";

import { Navigation } from "./Navigation";

export function Sidebar() {
  return (
    <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 min-h-[calc(100vh-4rem)]">
      <div className="p-4">
        <Navigation />
      </div>
    </aside>
  );
}
