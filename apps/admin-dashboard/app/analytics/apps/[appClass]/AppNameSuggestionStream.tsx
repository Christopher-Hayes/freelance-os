import { getOrCreateApp } from "@/lib/app-analytics";
import { suggestAppName } from "@/lib/ai-actions";
import { formatAppTitle } from "@/lib/util";
import AppNameSuggestionBanner from "./AppNameSuggestionBanner";

type Props = {
  appClass: string;
  displayName: string;
  windowTitles: string[];
};

/**
 * Async server component that fetches the AI name suggestion.
 * Rendered inside a <Suspense> boundary so it streams in without blocking the page.
 */
export default async function AppNameSuggestionStream({ appClass, displayName, windowTitles }: Props) {
  const appRecord = await getOrCreateApp(appClass);

  if (appRecord.displayName || appRecord.suggestNameDismissed || windowTitles.length === 0) {
    return null;
  }

  let nameSuggestion: string | null = appRecord.suggestedName;

  if (!nameSuggestion) {
    try {
      const result = await suggestAppName(appClass, windowTitles);
      nameSuggestion = result.suggestedName;
    } catch {
      return null;
    }
  }

  if (!nameSuggestion) return null;

  return (
    <AppNameSuggestionBanner
      appClass={appClass}
      suggestedName={nameSuggestion}
      currentDisplayName={displayName}
    />
  );
}
