import { createHash } from "node:crypto";
import { prisma, type Prisma } from "@freelance-os/database";

/**
 * Generic cache for deterministic AI action outputs. Looks up a previous
 * result for the same `functionId` + `input` (hashed) before calling
 * `compute`, so repeated calls over the same data (e.g. re-summarizing the
 * same email across separate agent runs) reuse the stored result instead of
 * spending another model call.
 *
 * Only use this for calls whose output is fully determined by `input` —
 * don't cache anything that depends on wall-clock time, randomness, or
 * external state that can change between calls.
 */
export async function withAiCache<T extends Prisma.InputJsonValue>(
  functionId: string,
  input: unknown,
  compute: () => Promise<T>
): Promise<T> {
  const inputHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");

  const cached = await prisma.aiCallCache.findUnique({
    where: { functionId_inputHash: { functionId, inputHash } },
  });

  if (cached) {
    await prisma.aiCallCache.update({
      where: { id: cached.id },
      data: { hitCount: { increment: 1 } },
    });
    return cached.output as T;
  }

  const output = await compute();

  await prisma.aiCallCache.upsert({
    where: { functionId_inputHash: { functionId, inputHash } },
    create: { functionId, inputHash, output },
    update: { output },
  });

  return output;
}
