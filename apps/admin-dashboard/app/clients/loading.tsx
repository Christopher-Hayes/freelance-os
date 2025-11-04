"use client";

import { Skeleton } from "@repo/ui";

export default function ClientsLoading() {
  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Skeleton width={200} height={36} className="mb-2" />
          <Skeleton width={300} height={20} />
        </div>
        <Skeleton width={120} height={40} variant="rectangular" />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-6">
            <div className="mb-4">
              <Skeleton width="60%" height={24} className="mb-2" />
              <Skeleton width="40%" height={16} />
            </div>
            <div className="space-y-2">
              <Skeleton width="100%" height={16} />
              <Skeleton width="80%" height={16} />
              <div className="flex gap-4 pt-2">
                <Skeleton width={80} height={16} />
                <Skeleton width={80} height={16} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

