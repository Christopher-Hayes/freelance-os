'use client';

import { useState } from 'react';
import { Check, Plus, Sparkles, Trash2, X, Pencil, Star } from 'lucide-react';
import { suggestProjectHighlights, suggestEmojiForHighlight, type SuggestedHighlight } from '@/lib/highlight-actions';
import { formatPlainDate } from '@/lib/datetime';
import { authFetch } from '@/lib/util';

// Curated palette of milestone-relevant emojis
const EMOJI_PALETTE = [
  { emoji: '🚀', label: 'Launch' },
  { emoji: '🎉', label: 'Celebration' },
  { emoji: '🏁', label: 'Finish' },
  { emoji: '👋', label: 'Kickoff' },
  { emoji: '💡', label: 'Idea / Pivot' },
  { emoji: '🔧', label: 'Technical' },
  { emoji: '🐛', label: 'Bug' },
  { emoji: '✅', label: 'Milestone' },
  { emoji: '📅', label: 'Scheduled' },
  { emoji: '🤝', label: 'Meeting' },
  { emoji: '📦', label: 'Delivery' },
  { emoji: '🎯', label: 'Goal' },
  { emoji: '⚠️', label: 'Issue' },
  { emoji: '🔀', label: 'Change' },
  { emoji: '📱', label: 'Mobile' },
  { emoji: '🌐', label: 'Web / Go-live' },
  { emoji: '🎨', label: 'Design' },
  { emoji: '🧪', label: 'Testing' },
  { emoji: '📊', label: 'Analytics' },
  { emoji: '💰', label: 'Payment' },
  { emoji: '📝', label: 'Docs' },
  { emoji: '🔒', label: 'Security' },
  { emoji: '⏸️', label: 'Pause' },
  { emoji: '▶️', label: 'Resume' },
];

type Highlight = {
  id: number;
  projectId: number;
  date: string;
  label: string;
  emoji: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
};

interface ProjectHighlightsProps {
  projectId: number;
  highlights: Highlight[];
  onHighlightsChange: (highlights: Highlight[]) => void;
}

function EmojiPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (emoji: string) => void;
  label?: string;
}) {
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  async function handleSuggest() {
    if (!label?.trim()) return;
    setSuggesting(true);
    setSuggestError(null);
    try {
      const result = await suggestEmojiForHighlight(label.trim(), value);
      if (result.error) {
        setSuggestError(result.error);
      } else if (result.emoji) {
        onChange(result.emoji);
      }
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : 'Failed to suggest emoji');
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {EMOJI_PALETTE.map(({ emoji, label: emojiLabel }) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onChange(value === emoji ? '' : emoji)}
            title={emojiLabel}
            className={`rounded p-1 text-lg leading-none transition hover:bg-gray-100 dark:hover:bg-gray-700 ${
              value === emoji ? 'bg-blue-100 ring-2 ring-blue-500 dark:bg-blue-900/40' : ''
            }`}
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder="Or paste any emoji…"
          maxLength={10}
          className="w-36 rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
        {label?.trim() && (
          <button
            type="button"
            onClick={handleSuggest}
            disabled={suggesting}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-purple-600 transition hover:bg-purple-50 disabled:opacity-50 dark:text-purple-400 dark:hover:bg-purple-950/30"
            title="Ask AI to suggest an emoji for this label"
          >
            <Sparkles className="h-3 w-3" />
            {suggesting ? '…' : 'Suggest'}
          </button>
        )}
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            Clear
          </button>
        )}
      </div>
      {suggestError && (
        <p className="text-xs text-red-500 dark:text-red-400">{suggestError}</p>
      )}
    </div>
  );
}

export function ProjectHighlights({ projectId, highlights, onHighlightsChange }: ProjectHighlightsProps) {
  // Add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newEmoji, setNewEmoji] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // AI suggestions
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedHighlight[]>([]);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [acceptingSuggestion, setAcceptingSuggestion] = useState<string | null>(null);

  // Delete
  const [deletingId, setDeletingId] = useState<number | null>(null);

  function sortHighlights(hs: Highlight[]) {
    return [...hs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  async function handleAdd() {
    if (!newDate || !newLabel.trim()) return;
    setAddSaving(true);
    setAddError(null);
    try {
      const res = await authFetch(`/api/projects/${projectId}/highlights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newDate, label: newLabel.trim(), emoji: newEmoji || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create highlight');
      onHighlightsChange(sortHighlights([...highlights, data]));
      setNewDate('');
      setNewLabel('');
      setNewEmoji('');
      setShowAddForm(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add highlight');
    } finally {
      setAddSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      const res = await authFetch(`/api/projects/${projectId}/highlights/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete highlight');
      onHighlightsChange(highlights.filter((h) => h.id !== id));
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  }

  function startEditing(h: Highlight) {
    setEditingId(h.id);
    setEditDate(h.date.split('T')[0] ?? '');
    setEditLabel(h.label);
    setEditEmoji(h.emoji ?? '');
  }

  async function handleEditSave() {
    if (!editingId || !editDate || !editLabel.trim()) return;
    setEditSaving(true);
    try {
      const res = await authFetch(`/api/projects/${projectId}/highlights/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: editDate, label: editLabel.trim(), emoji: editEmoji || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update highlight');
      onHighlightsChange(sortHighlights(highlights.map((h) => (h.id === editingId ? data : h))));
      setEditingId(null);
    } catch (err) {
      console.error(err);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleSuggest() {
    setSuggesting(true);
    setSuggestError(null);
    setSuggestions([]);
    try {
      const result = await suggestProjectHighlights(projectId);
      if (result.error) setSuggestError(result.error);
      setSuggestions(result.suggestions);
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : 'Failed to get suggestions');
    } finally {
      setSuggesting(false);
    }
  }

  async function acceptSuggestion(s: SuggestedHighlight) {
    const key = `${s.date}:${s.label}`;
    setAcceptingSuggestion(key);
    try {
      const res = await authFetch(`/api/projects/${projectId}/highlights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: s.date, label: s.label, emoji: s.emoji || null, source: 'ai-suggested' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to accept suggestion');
      onHighlightsChange(sortHighlights([...highlights, data]));
      setSuggestions((prev) => prev.filter((x) => !(x.date === s.date && x.label === s.label)));
    } catch (err) {
      console.error(err);
    } finally {
      setAcceptingSuggestion(null);
    }
  }

  function dismissSuggestion(s: SuggestedHighlight) {
    setSuggestions((prev) => prev.filter((x) => !(x.date === s.date && x.label === s.label)));
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star className="h-5 w-5 text-amber-500" />
          <h2 className="text-xl font-semibold dark:text-white">Highlights</h2>
          {highlights.length > 0 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
              {highlights.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSuggest}
            disabled={suggesting}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-purple-600 transition hover:bg-purple-50 disabled:opacity-50 dark:text-purple-400 dark:hover:bg-purple-950/30"
            title="Use AI to suggest highlights based on emails, calendar, and activity"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {suggesting ? 'Analyzing…' : 'Suggest'}
          </button>
          <button
            onClick={() => { setShowAddForm(true); setAddError(null); }}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-blue-600 transition hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        </div>
      </div>

      <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">
        Notable dates during this project — useful for annotating timeline charts
      </p>

      {/* AI Suggestions */}
      {suggestError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {suggestError}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mb-4 rounded-lg border border-purple-200 bg-purple-50/50 p-4 dark:border-purple-800/50 dark:bg-purple-950/20">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-purple-700 dark:text-purple-300">
            <Sparkles className="h-4 w-4" />
            AI Suggestions
          </div>
          <div className="space-y-2">
            {suggestions.map((s) => {
              const key = `${s.date}:${s.label}`;
              return (
                <div
                  key={key}
                  className="flex items-start justify-between gap-3 rounded-lg bg-white/80 p-3 dark:bg-gray-800/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {s.emoji && <span className="text-base leading-none">{s.emoji}</span>}
                      <span className="shrink-0 text-xs font-mono text-gray-500 dark:text-gray-400">{s.date}</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{s.label}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{s.reason}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => acceptSuggestion(s)}
                      disabled={acceptingSuggestion === key}
                      className="rounded p-1 text-green-600 hover:bg-green-50 disabled:opacity-50 dark:text-green-400 dark:hover:bg-green-900/20"
                      title="Accept"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => dismissSuggestion(s)}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      title="Dismiss"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-800/50 dark:bg-blue-950/20">
          {addError && <div className="mb-3 text-sm text-red-600 dark:text-red-400">{addError}</div>}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="shrink-0">
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Date</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Label</label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setShowAddForm(false); }}
                  placeholder="e.g. Project kickoff, Soft launch, Client review"
                  maxLength={100}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  autoFocus
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">Emoji</label>
              <EmojiPicker value={newEmoji} onChange={setNewEmoji} label={newLabel} />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleAdd}
                disabled={addSaving || !newDate || !newLabel.trim()}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {addSaving ? 'Saving…' : 'Add highlight'}
              </button>
              <button
                onClick={() => { setShowAddForm(false); setAddError(null); setNewEmoji(''); }}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Highlights list */}
      {highlights.length === 0 && !showAddForm && suggestions.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No highlights yet. Add important dates like launches, kickoffs, or milestones.
        </p>
      ) : (
        <div className="space-y-1">
          {highlights.map((h) => (
            <div key={h.id} className="group rounded-lg transition hover:bg-gray-50 dark:hover:bg-gray-700/50">
              {editingId === h.id ? (
                // ── Edit mode ──
                <div className="p-3">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className="rounded border border-blue-400 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                      <input
                        type="text"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleEditSave(); if (e.key === 'Escape') setEditingId(null); }}
                        maxLength={100}
                        className="flex-1 rounded border border-blue-400 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-500 dark:bg-gray-700 dark:text-white"
                        autoFocus
                      />
                      <button
                        onClick={handleEditSave}
                        disabled={editSaving}
                        className="rounded p-1 text-green-600 hover:bg-green-50 disabled:opacity-50 dark:text-green-400 dark:hover:bg-green-900/20"
                        title="Save"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                        title="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">Emoji</label>
                      <EmojiPicker value={editEmoji} onChange={setEditEmoji} label={editLabel} />
                    </div>
                  </div>
                </div>
              ) : (
                // ── View mode ──
                <div className="flex items-center gap-3 px-3 py-2">
                  {/* Emoji or fallback pip */}
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                    {h.emoji ? (
                      <span className="text-base leading-none">{h.emoji}</span>
                    ) : (
                      <div className="h-2 w-2 rounded-full bg-amber-400 dark:bg-amber-500" />
                    )}
                  </div>
                  <span className="shrink-0 text-xs font-mono text-gray-500 dark:text-gray-400">
                    {formatPlainDate(h.date, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{h.label}</span>
                  {h.source === 'ai-suggested' && (
                    <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                      AI
                    </span>
                  )}
                  <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => startEditing(h)}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      title="Edit"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleDelete(h.id)}
                      disabled={deletingId === h.id}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
