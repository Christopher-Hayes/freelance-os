"use server";

import { prisma } from "@freelance-os/database";
import { generateText } from "ai";
import { getAiModel, isAiConfigured } from "@/lib/ai-provider";

/**
 * Merge two time entries into one
 */
export async function mergeTimeEntries(entryId1: number, entryId2: number) {
  // Fetch both entries
  const [entry1, entry2] = await Promise.all([
    prisma.timeEntry.findUnique({ where: { id: entryId1 } }),
    prisma.timeEntry.findUnique({ where: { id: entryId2 } }),
  ]);

  if (!entry1 || !entry2) {
    throw new Error('One or both entries not found');
  }

  // Verify they're for the same project
  if (entry1.projectId !== entry2.projectId) {
    throw new Error('Entries must be for the same project');
  }

  // Determine which is earlier
  const earlier = entry1.startTime < entry2.startTime ? entry1 : entry2;
  const later = entry1.startTime < entry2.startTime ? entry2 : entry1;

  // Merge descriptions using AI if both have descriptions
  let mergedDescription = earlier.description || later.description || null;
  
  if (earlier.description && later.description && (await isAiConfigured())) {
    try {
      const aiModel = await getAiModel();
      const { text } = await generateText({
        model: aiModel,
        prompt: `Merge these two work descriptions into a single concise description (max 100 characters):

Description 1: ${earlier.description}
Description 2: ${later.description}

Return only the merged description, nothing else.`,
      });
      mergedDescription = text.trim().substring(0, 200);
    } catch (error) {
      console.error("Error merging descriptions with AI:", error);
      // Fallback to simple concatenation
      mergedDescription = `${earlier.description} / ${later.description}`;
    }
  }

  // Calculate new duration
  const durationMs = later.endTime.getTime() - earlier.startTime.getTime();
  const durationMinutes = Math.round(durationMs / (1000 * 60));

  // Update the earlier entry with merged data
  const updatedEntry = await prisma.timeEntry.update({
    where: { id: earlier.id },
    data: {
      endTime: later.endTime,
      durationMinutes,
      description: mergedDescription,
      billable: earlier.billable || later.billable, // Keep billable if either was billable
    },
    include: {
      project: {
        include: {
          client: true,
        },
      },
    },
  });

  // Delete the later entry
  await prisma.timeEntry.delete({
    where: { id: later.id },
  });

  return {
    entry: updatedEntry,
    deletedId: later.id,
  };
}
