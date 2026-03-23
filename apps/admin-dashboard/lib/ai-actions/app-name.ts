"use server";

import { z } from "zod";
import { getAiModel } from "@/lib/ai-provider";
import { generateObjectWithTelemetry } from "./shared";

/**
 * Suggest a better display name for an app based on its WM_CLASS and top window titles.
 *
 * Checks the App record first:
 *   - If a suggestion already exists (or was dismissed), returns immediately.
 *   - If the user already set a displayName, no suggestion is needed.
 *   - Otherwise, asks the AI to evaluate whether the wmclass name is clear enough
 *     and, if not, suggest a human-friendly alternative.
 *
 * The suggestion is persisted to the App table so we don't burn tokens on repeat visits.
 */
export async function suggestAppName(
  appClass: string,
  topWindowTitles: string[]
): Promise<{ suggestedName: string | null; alreadyHandled: boolean }> {
  const { prisma: db } = await import("@freelance-os/database");

  const app = await db.app.upsert({
    where: { appClass },
    create: { appClass },
    update: {},
  });

  if (app.displayName || app.suggestedName || app.suggestNameDismissed) {
    return { suggestedName: app.suggestedName, alreadyHandled: true };
  }

  const model = await getAiModel();

  const { object } = await generateObjectWithTelemetry({
    model,
    schema: z.object({
      shouldSuggest: z
        .boolean()
        .describe("Whether a rename suggestion would be helpful"),
      suggestedName: z
        .string()
        .nullable()
        .describe(
          "The suggested human-friendly display name, or null if the current name is already clear"
        ),
    }),
    prompt: `You are helping organise an activity-tracking dashboard. The user has an app identified by its window-manager class name (WM_CLASS).

WM_CLASS: "${appClass}"

Here are some of the most common window titles seen with this app (most-used first):
${topWindowTitles
  .slice(0, 6)
  .map((title, i) => `${i + 1}. "${title}"`)
  .join("\n")}

Decide whether the WM_CLASS name is already a clear, recognisable application name for a human. Many WM_CLASS values are already perfectly fine (e.g. "Firefox", "Slack", "Spotify"). Others are cryptic identifiers like "org.gnome.Nautilus", "com.mitchellh.ghostty", "ptyxis", "Soffice", or contain underscores/hyphens that make them hard to scan (e.g. "google-chrome", "code-oss").

If the name is already clear enough, set shouldSuggest=false and suggestedName=null.

If a better name exists, set shouldSuggest=true and provide a short, recognisable display name. Use the window titles as clues to figure out what the app actually is. Keep the name concise — usually 1-3 words (e.g. "Google Chrome", "VS Code", "Files", "Terminal", "LibreOffice").`,
  });

  if (object.shouldSuggest && object.suggestedName) {
    const trimmed = object.suggestedName.trim();
    await db.app.update({
      where: { appClass },
      data: { suggestedName: trimmed },
    });
    return { suggestedName: trimmed, alreadyHandled: false };
  }

  await db.app.update({
    where: { appClass },
    data: { suggestNameDismissed: true },
  });

  return { suggestedName: null, alreadyHandled: false };
}
