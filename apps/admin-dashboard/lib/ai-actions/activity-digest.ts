import { Temporal } from "@/lib/temporal-polyfill";

/**
 * Activity digest
 * ---------------
 * Raw activity sessions are extremely granular: a browser produces dozens of
 * short window-title changes per hour. Feeding those to the model verbatim (or,
 * worse, feeding a character-truncated dump of them) meant that for long
 * sessions the model only ever saw the first hour or so, and had no idea how
 * much total time went to any given site.
 *
 * Instead of describing a session as a chronological wall of titles, we roll it
 * up into "what was used, for how long, and in which blocks". Sites/projects
 * that only got a handful of seconds are folded into a single "shorter pages"
 * line so they stay visible as context without drowning out real work.
 */

export type ActivitySessionForAI = {
  id: number;
  startTime: string;
  endTime: string;
  appClass: string;
  windowTitle: string | null;
  durationSeconds: number;
  subSessions?: ActivitySessionForAI[];
};

export type DigestBlock = {
  startTime: string;
  endTime: string;
  seconds: number;
};

export type DigestItem = {
  /** Site / project / app the activity belongs to (e.g. "Figma", "frontline-chat-agent"). */
  label: string;
  /** Distinct page/file titles seen under that label, most-used first. */
  details: string[];
  seconds: number;
  visits: number;
  /** Contiguous-ish stretches of engagement with this label. */
  blocks: DigestBlock[];
};

export type SessionDigest = {
  appClass: string;
  startTime: string;
  endTime: string;
  /** Wall-clock span of the merged session, including bridged idle gaps. */
  spanSeconds: number;
  /** Sum of the tracked sub-session durations. */
  trackedSeconds: number;
  items: DigestItem[];
  minor: {
    seconds: number;
    count: number;
    labels: string[];
  };
};

// A site/project has to earn its own line: at least 3 minutes, and at least 2%
// of the session. Everything else is noise (a 10 second tab visit).
const MIN_ITEM_SECONDS = 180;
const MIN_ITEM_SHARE = 0.02;
const MAX_ITEMS = 10;
const MAX_DETAILS_PER_ITEM = 3;
const MAX_MINOR_LABELS = 8;
const MAX_ROLLUP_ENTRIES = 20;

// Returning to a site within this many minutes counts as the same block of
// work — people tab away to search, read docs, or check chat mid-task.
const BLOCK_GAP_MINUTES = 20;
const MAX_BLOCKS_PER_ITEM = 4;
const MIN_BLOCK_SECONDS = 240;

// Overall ceiling for the rendered activity section of a prompt. When we go
// over, we show fewer items per session rather than cutting a string in half.
const PROMPT_CHAR_BUDGET = 14000;

const TITLE_SEPARATORS = [" — ", " – ", " - ", " | ", " · ", " / ", " : ", " :: "];

const APP_SUFFIXES = [
  "mozilla firefox",
  "firefox",
  "firefox developer edition",
  "librewolf",
  "zen browser",
  "google chrome",
  "chromium",
  "brave",
  "microsoft edge",
  "safari",
  "vivaldi",
  "opera",
  "tor browser",
  "visual studio code",
  "code - oss",
  "vscodium",
  "discord",
  "thunderbird",
  "mozilla thunderbird",
];

const UNTITLED_LABEL = "Untitled window (no page title)";

function splitOnLastSeparator(title: string): { head: string; tail: string } | null {
  let bestIndex = -1;
  let bestSeparator = "";

  for (const separator of TITLE_SEPARATORS) {
    const index = title.lastIndexOf(separator);
    if (index > bestIndex) {
      bestIndex = index;
      bestSeparator = separator;
    }
  }

  if (bestIndex <= 0) return null;

  const head = title.slice(0, bestIndex).trim();
  const tail = title.slice(bestIndex + bestSeparator.length).trim();
  if (!head || !tail) return null;

  return { head, tail };
}

/** Drop the trailing " — Mozilla Firefox" / " - Visual Studio Code" style suffix. */
function stripAppSuffix(title: string): string {
  let current = title;

  for (let i = 0; i < 2; i++) {
    const split = splitOnLastSeparator(current);
    if (!split) break;
    if (!APP_SUFFIXES.includes(split.tail.toLowerCase())) break;
    current = split.head;
  }

  return current;
}

/**
 * Turn a raw window title into a (label, detail) pair, where the label is the
 * site / repo / app that owns the window and the detail is the specific page or
 * file. "Frontline Website – Figma" → label "Figma", detail "Frontline Website".
 */
export function classifyWindowTitle(rawTitle: string | null | undefined): {
  label: string;
  detail: string | null;
} {
  const trimmed = (rawTitle ?? "").trim().replace(/^\(\d+\)\s*/, "");
  if (!trimmed) return { label: UNTITLED_LABEL, detail: null };

  const cleaned = stripAppSuffix(trimmed).trim();
  // A bare app name ("Mozilla Firefox") means the window was focused with no
  // page/document title — real time, but nothing to attribute it to.
  if (!cleaned || APP_SUFFIXES.includes(cleaned.toLowerCase())) {
    return { label: UNTITLED_LABEL, detail: null };
  }

  const split = splitOnLastSeparator(cleaned);
  // A long trailing segment is a sentence fragment, not a site name.
  if (split && split.tail.length <= 40) {
    return { label: split.tail, detail: split.head };
  }

  return { label: cleaned, detail: null };
}

function instant(value: string) {
  return Temporal.Instant.from(value);
}

function secondsBetween(start: Temporal.Instant, end: Temporal.Instant): number {
  return Number(end.epochNanoseconds - start.epochNanoseconds) / 1_000_000_000;
}

function subSessionSeconds(session: ActivitySessionForAI): number {
  if (Number.isFinite(session.durationSeconds) && session.durationSeconds > 0) {
    return session.durationSeconds;
  }
  return Math.max(0, secondsBetween(instant(session.startTime), instant(session.endTime)));
}

function buildBlocks(parts: ActivitySessionForAI[]): DigestBlock[] {
  const sorted = [...parts].sort((a, b) =>
    Temporal.Instant.compare(instant(a.startTime), instant(b.startTime))
  );

  const blocks: DigestBlock[] = [];

  for (const part of sorted) {
    const previous = blocks.at(-1);
    const gapMinutes = previous
      ? secondsBetween(instant(previous.endTime), instant(part.startTime)) / 60
      : Infinity;

    if (previous && gapMinutes <= BLOCK_GAP_MINUTES) {
      if (Temporal.Instant.compare(instant(part.endTime), instant(previous.endTime)) > 0) {
        previous.endTime = part.endTime;
      }
      previous.seconds = secondsBetween(instant(previous.startTime), instant(previous.endTime));
    } else {
      blocks.push({
        startTime: part.startTime,
        endTime: part.endTime,
        seconds: secondsBetween(instant(part.startTime), instant(part.endTime)),
      });
    }
  }

  return blocks;
}

/** Roll one merged session up into per-site totals, blocks, and a noise bucket. */
export function buildSessionDigest(session: ActivitySessionForAI): SessionDigest {
  const parts = session.subSessions?.length ? session.subSessions : [session];

  const groups = new Map<
    string,
    { seconds: number; visits: number; parts: ActivitySessionForAI[]; details: Map<string, number> }
  >();

  for (const part of parts) {
    const { label, detail } = classifyWindowTitle(part.windowTitle);
    const seconds = subSessionSeconds(part);

    let group = groups.get(label);
    if (!group) {
      group = { seconds: 0, visits: 0, parts: [], details: new Map() };
      groups.set(label, group);
    }

    group.seconds += seconds;
    group.visits += 1;
    group.parts.push(part);
    if (detail) {
      group.details.set(detail, (group.details.get(detail) ?? 0) + seconds);
    }
  }

  const trackedSeconds = parts.reduce((total, part) => total + subSessionSeconds(part), 0);
  const spanSeconds = Math.max(
    0,
    secondsBetween(instant(session.startTime), instant(session.endTime))
  );

  const minimumSeconds = Math.min(
    MIN_ITEM_SECONDS,
    Math.max(60, trackedSeconds * MIN_ITEM_SHARE)
  );

  const ranked = [...groups.entries()].sort((a, b) => b[1].seconds - a[1].seconds);

  const items: DigestItem[] = [];
  const minorLabels: string[] = [];
  let minorSeconds = 0;
  let minorCount = 0;

  for (const [label, group] of ranked) {
    const significant =
      items.length < MAX_ITEMS &&
      group.seconds >= minimumSeconds &&
      group.seconds >= trackedSeconds * MIN_ITEM_SHARE;

    if (!significant) {
      minorSeconds += group.seconds;
      minorCount += 1;
      if (label !== UNTITLED_LABEL && minorLabels.length < MAX_MINOR_LABELS) {
        minorLabels.push(label);
      }
      continue;
    }

    const blocks = buildBlocks(group.parts);
    const meaningfulBlocks = blocks.filter((block) => block.seconds >= MIN_BLOCK_SECONDS);

    items.push({
      label,
      details: [...group.details.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_DETAILS_PER_ITEM)
        .map(([detail]) => detail),
      seconds: Math.round(group.seconds),
      visits: group.visits,
      blocks: (meaningfulBlocks.length > 0 ? meaningfulBlocks : blocks)
        .sort((a, b) => b.seconds - a.seconds)
        .slice(0, MAX_BLOCKS_PER_ITEM)
        .sort((a, b) => Temporal.Instant.compare(instant(a.startTime), instant(b.startTime))),
    });
  }

  return {
    appClass: session.appClass,
    startTime: session.startTime,
    endTime: session.endTime,
    spanSeconds: Math.round(spanSeconds),
    trackedSeconds: Math.round(trackedSeconds),
    items,
    minor: {
      seconds: Math.round(minorSeconds),
      count: minorCount,
      labels: minorLabels,
    },
  };
}

export function formatDuration(seconds: number): string {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function clockParts(value: string, timeZone: string) {
  const zoned = instant(value).toZonedDateTimeISO(timeZone);
  const period = zoned.hour >= 12 ? "PM" : "AM";
  const displayHour = zoned.hour % 12 === 0 ? 12 : zoned.hour % 12;
  return {
    time: `${displayHour}:${zoned.minute.toString().padStart(2, "0")}`,
    period,
  };
}

export function formatClockRange(startTime: string, endTime: string, timeZone: string): string {
  const start = clockParts(startTime, timeZone);
  const end = clockParts(endTime, timeZone);

  return start.period === end.period
    ? `${start.time}–${end.time} ${end.period}`
    : `${start.time} ${start.period}–${end.time} ${end.period}`;
}

/**
 * One-line summary, for prompts (and UI) that only need "what was this session".
 */
export function summarizeDigestOneLine(digest: SessionDigest): string {
  const parts = digest.items
    .slice(0, 5)
    .map((item) =>
      item.details.length > 0
        ? `${item.label} (${formatDuration(item.seconds)}: ${item.details.slice(0, 2).join(", ")})`
        : `${item.label} (${formatDuration(item.seconds)})`
    );

  if (digest.minor.count > 0) {
    parts.push(`${digest.minor.count} brief others (${formatDuration(digest.minor.seconds)})`);
  }

  return parts.join(" · ");
}

/**
 * Full multi-line rollup for the autofill prompt: totals per site plus the
 * blocks of time each one occupied, so the model can attribute long stretches
 * to the right project instead of guessing from the first few window titles.
 */
export function formatSessionDigest(
  digest: SessionDigest,
  options: { timeZone: string; maxItems?: number }
): string {
  const { timeZone } = options;
  const maxItems = options.maxItems ?? MAX_ITEMS;

  const header =
    `- ${digest.appClass} — ${formatDuration(digest.spanSeconds)} span, ` +
    `${formatDuration(digest.trackedSeconds)} tracked ` +
    `(${formatClockRange(digest.startTime, digest.endTime, timeZone)} local; ` +
    `${digest.startTime} to ${digest.endTime})`;

  const shown = digest.items.slice(0, maxItems);
  const overflow = digest.items.slice(maxItems);

  const lines = shown.map((item) => {
    const segments = [`${item.label} — ${formatDuration(item.seconds)}`];

    if (item.visits > 1) {
      segments.push(`${item.visits} visits`);
    }

    if (item.blocks.length > 0) {
      const blocks = item.blocks
        .map((block) => formatClockRange(block.startTime, block.endTime, timeZone))
        .join(", ");
      segments.push(`active ${blocks}`);
    }

    if (item.details.length > 0) {
      segments.push(`titles: ${item.details.join("; ")}`);
    }

    return `    • ${segments.join(" · ")}`;
  });

  const overflowSeconds = overflow.reduce((total, item) => total + item.seconds, 0);
  const minorSeconds = digest.minor.seconds + overflowSeconds;
  const minorCount = digest.minor.count + overflow.length;

  // Always show the noise line when nothing else qualified, so a session never
  // renders as a bare header with no indication of what happened in it.
  if (minorCount > 0 && (minorSeconds >= 60 || lines.length === 0)) {
    const labels = [...overflow.map((item) => item.label), ...digest.minor.labels].slice(
      0,
      MAX_MINOR_LABELS
    );
    const labelText = labels.length > 0 ? `: ${labels.join(", ")}` : "";
    lines.push(
      `    • ${minorCount} brief/other title${minorCount === 1 ? "" : "s"} — ${formatDuration(minorSeconds)} total${labelText}`
    );
  }

  return [header, ...lines].join("\n");
}

export type DayRollupEntry = {
  label: string;
  seconds: number;
  visits: number;
  apps: string[];
};

/**
 * Totals for each site/repo/app across the entire day, so the model can see at
 * a glance where the hours actually went before it starts placing entries.
 */
export function buildDayRollup(sessions: ActivitySessionForAI[]): {
  entries: DayRollupEntry[];
  minor: { seconds: number; count: number };
} {
  const totals = new Map<string, { seconds: number; visits: number; apps: Set<string> }>();

  for (const session of sessions) {
    const parts = session.subSessions?.length ? session.subSessions : [session];
    for (const part of parts) {
      const { label } = classifyWindowTitle(part.windowTitle);
      let entry = totals.get(label);
      if (!entry) {
        entry = { seconds: 0, visits: 0, apps: new Set() };
        totals.set(label, entry);
      }
      entry.seconds += subSessionSeconds(part);
      entry.visits += 1;
      entry.apps.add(session.appClass);
    }
  }

  const ranked = [...totals.entries()].sort((a, b) => b[1].seconds - a[1].seconds);

  const entries: DayRollupEntry[] = [];
  let minorSeconds = 0;
  let minorCount = 0;

  for (const [label, value] of ranked) {
    if (value.seconds >= MIN_ITEM_SECONDS && entries.length < MAX_ROLLUP_ENTRIES) {
      entries.push({
        label,
        seconds: Math.round(value.seconds),
        visits: value.visits,
        apps: [...value.apps],
      });
    } else {
      minorSeconds += value.seconds;
      minorCount += 1;
    }
  }

  return { entries, minor: { seconds: Math.round(minorSeconds), count: minorCount } };
}

export function formatDayRollup(sessions: ActivitySessionForAI[]): string {
  const { entries, minor } = buildDayRollup(sessions);
  if (entries.length === 0) return "";

  const lines = entries.map(
    (entry) =>
      `    • ${entry.label} — ${formatDuration(entry.seconds)} (${entry.apps.join(", ")})`
  );

  if (minor.count > 0 && minor.seconds >= 60) {
    lines.push(
      `    • ${minor.count} other short-lived title${minor.count === 1 ? "" : "s"} — ${formatDuration(minor.seconds)} total`
    );
  }

  return lines.join("\n");
}

/**
 * Render every merged session for a prompt, in chronological order, shrinking
 * per-session detail if the whole block would blow the character budget.
 * Nothing is ever cut mid-line: a long day loses depth, not hours.
 */
export function formatSessionsForPrompt(
  sessions: ActivitySessionForAI[],
  options?: { timeZone?: string; charBudget?: number }
): string {
  const timeZone = options?.timeZone ?? Temporal.Now.timeZoneId();
  const budget = options?.charBudget ?? PROMPT_CHAR_BUDGET;

  const digests = [...sessions]
    .sort((a, b) => Temporal.Instant.compare(instant(a.startTime), instant(b.startTime)))
    .map((session) => buildSessionDigest(session));

  for (let maxItems = MAX_ITEMS; maxItems >= 3; maxItems--) {
    const rendered = digests
      .map((digest) => formatSessionDigest(digest, { timeZone, maxItems }))
      .join("\n");

    if (rendered.length <= budget || maxItems === 3) {
      return rendered;
    }
  }

  return "";
}
