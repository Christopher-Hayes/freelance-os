'use client';

import { useEffect, useRef, useState } from 'react';
import type { Project } from '@freelance-os/types';

interface ProjectMultiSelectProps {
  id?: string;
  projects: Project[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
  showRates?: boolean;
}

export default function ProjectMultiSelect({
  id,
  projects,
  selectedIds,
  onChange,
  disabled,
  showRates,
}: ProjectMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const selectedSet = new Set(selectedIds);
  const allSelected = projects.length > 0 && selectedIds.length === projects.length;

  const summary = projects.length === 0
    ? 'No projects available'
    : selectedIds.length === 0
    ? 'No projects selected'
    : allSelected
    ? 'All projects'
    : selectedIds.length === 1
    ? (projects.find(p => p.id === selectedIds[0])?.name ?? '1 project selected')
    : `${selectedIds.length} of ${projects.length} projects`;

  const toggleProject = (projectId: number) => {
    if (selectedSet.has(projectId)) {
      onChange(selectedIds.filter(id => id !== projectId));
    } else {
      onChange([...selectedIds, projectId]);
    }
  };

  const toggleAll = () => {
    onChange(allSelected ? [] : projects.map(p => p.id));
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed text-left"
      >
        <span className="truncate">{summary}</span>
        <svg className="h-4 w-4 shrink-0 ml-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-lg">
          {projects.length > 0 && (
            <label className="flex items-center gap-2 px-3 py-2 text-sm font-medium border-b border-gray-200 dark:border-gray-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="rounded border-gray-300 dark:border-gray-500 text-blue-500 focus:ring-blue-500"
              />
              <span className="text-gray-700 dark:text-gray-200">
                {allSelected ? 'Deselect all' : 'Select all'}
              </span>
            </label>
          )}
          {projects.map((project) => (
            <label
              key={project.id}
              className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              <input
                type="checkbox"
                checked={selectedSet.has(project.id)}
                onChange={() => toggleProject(project.id)}
                className="rounded border-gray-300 dark:border-gray-500 text-blue-500 focus:ring-blue-500"
              />
              <span className="text-gray-700 dark:text-gray-200">
                {project.name}
                {showRates && project.hourlyRate != null ? ` ($${Number(project.hourlyRate).toFixed(2)}/hr)` : ''}
              </span>
            </label>
          ))}
          {projects.length === 0 && (
            <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No projects for this client</p>
          )}
        </div>
      )}
    </div>
  );
}
