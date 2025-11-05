'use client';

import { useState, useEffect } from 'react';
import Link from "next/link";
import { APIFooter } from "@repo/ui";
import { generateCode } from '@/lib/ai-actions';

type DashboardStats = {
  clientCount: number;
  projectCount: number;
  invoiceCount: number;
};

export default function Page() {
  const [stats, setStats] = useState<DashboardStats>({ clientCount: 0, projectCount: 0, invoiceCount: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/clients').then(res => res.json()),
      fetch('/api/projects').then(res => res.json()),
      fetch('/api/invoices').then(res => res.json()),
    ])
      .then(([clients, projects, invoices]) => {
        setStats({
          clientCount: Array.isArray(clients) ? clients.length : 0,
          projectCount: Array.isArray(projects) ? projects.length : 0,
          invoiceCount: Array.isArray(invoices) ? invoices.length : 0,
        });
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching stats:', err);
        setLoading(false);
      });
  }, []);

  const handleGenerateCode = async (endpoint: any, language: string) => {
    return await generateCode(endpoint, language);
  };

  if (loading) {
    return <div className="p-8"><div className="text-gray-600 dark:text-gray-400">Loading...</div></div>;
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Welcome to Freelance OS</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-3 mb-8">
        <Link
          href="/clients"
          className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-6 hover:shadow-lg dark:hover:shadow-gray-900 transition-shadow"
        >
          <div className="text-4xl font-bold text-blue-600 dark:text-blue-400">
            {stats.clientCount}
          </div>
          <div className="text-gray-600 dark:text-gray-400 mt-2">Total Clients</div>
          <div className="text-blue-600 dark:text-blue-400 text-sm mt-3 hover:underline">
            View all →
          </div>
        </Link>

        <Link
          href="/projects"
          className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-6 hover:shadow-lg dark:hover:shadow-gray-900 transition-shadow"
        >
          <div className="text-4xl font-bold text-green-600 dark:text-green-400">
            {stats.projectCount}
          </div>
          <div className="text-gray-600 dark:text-gray-400 mt-2">Active Projects</div>
          <div className="text-green-600 dark:text-green-400 text-sm mt-3 hover:underline">
            View all →
          </div>
        </Link>

        <Link
          href="/invoices"
          className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-6 hover:shadow-lg dark:hover:shadow-gray-900 transition-shadow"
        >
          <div className="text-4xl font-bold text-purple-600 dark:text-purple-400">
            {stats.invoiceCount}
          </div>
          <div className="text-gray-600 dark:text-gray-400 mt-2">Total Invoices</div>
          <div className="text-purple-600 dark:text-purple-400 text-sm mt-3 hover:underline">
            View all →
          </div>
        </Link>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-6">
        <h2 className="text-xl font-semibold mb-4 dark:text-white">Quick Actions</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/clients/new"
            className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors text-center"
          >
            <div className="text-2xl mb-2">👤</div>
            <div className="font-medium dark:text-gray-200">Add Client</div>
          </Link>
          <Link
            href="/projects/new"
            className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-green-500 dark:hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors text-center"
          >
            <div className="text-2xl mb-2">📁</div>
            <div className="font-medium dark:text-gray-200">New Project</div>
          </Link>
          <Link
            href="/time/new"
            className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-orange-500 dark:hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors text-center"
          >
            <div className="text-2xl mb-2">⏱️</div>
            <div className="font-medium dark:text-gray-200">Log Time</div>
          </Link>
          <Link
            href="/invoices/new"
            className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-purple-500 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-colors text-center"
          >
            <div className="text-2xl mb-2">💰</div>
            <div className="font-medium dark:text-gray-200">Create Invoice</div>
          </Link>
        </div>
      </div>

      <APIFooter
        enableApiKeys
        enableCodeGen
        onGenerateApiKey={() => window.location.href = '/api-demo'}
        onGenerateCode={handleGenerateCode}
        endpoints={[
          {
            method: "GET",
            path: "/clients",
            description: "List all clients",
            queryParams: [
              {
                name: "page",
                type: "number",
                description: "Page number for pagination",
              },
              {
                name: "limit",
                type: "number",
                description: "Items per page",
              },
            ],
          },
          {
            method: "GET",
            path: "/projects",
            description: "List all projects",
            queryParams: [
              {
                name: "clientId",
                type: "number",
                description: "Filter by client",
              },
              {
                name: "status",
                type: "string",
                enum: ["active", "completed", "on-hold"],
                description: "Filter by status",
              },
            ],
          },
          {
            method: "GET",
            path: "/invoices",
            description: "List all invoices",
            queryParams: [
              {
                name: "clientId",
                type: "number",
                description: "Filter by client",
              },
              {
                name: "status",
                type: "string",
                enum: ["draft", "sent", "paid", "overdue", "cancelled"],
                description: "Filter by status",
              },
            ],
          },
          {
            method: "GET",
            path: "/time",
            description: "List all time entries",
            queryParams: [
              {
                name: "projectId",
                type: "number",
                description: "Filter by project",
              },
              {
                name: "startDate",
                type: "string",
                description: "Filter from date (YYYY-MM-DD)",
              },
              {
                name: "endDate",
                type: "string",
                description: "Filter to date (YYYY-MM-DD)",
              },
            ],
          },
        ]}
      />
    </div>
  );
}
