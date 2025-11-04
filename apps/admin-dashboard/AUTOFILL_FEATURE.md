# Timeline Autofill Feature

## Overview

The Timeline Autofill feature uses AI to automatically suggest time entries based on your computer activity sessions. This feature helps you quickly populate your project tracking timeline by analyzing what apps you used and when, then intelligently matching that activity to your active projects.

## Setup

### 1. Install Dependencies

The required packages are already installed in the admin-dashboard:
- `ai` - Vercel AI SDK
- `@ai-sdk/openai` - OpenAI provider
- `zod` - Schema validation

### 2. Configure API Key

Add your OpenAI API key to your `.env` file:

```bash
OPENAI_API_KEY="sk-proj-your-openai-api-key-here"
```

Get your API key from: https://platform.openai.com/api-keys

## How It Works

### Data Flow

1. **Click Autofill Button** - Located next to "Project Tracking" title in the timeline view
2. **Fetch Activity Sessions** - Retrieves all activity sessions for the selected day
3. **Merge Sessions** - Combines adjacent sessions of the same app (reduces 300-500 sessions to ~50)
4. **Limit Descriptions** - Truncates long window titles to 200 characters to prevent token overflow
6. **Generate Suggestions** - AI returns structured time entry suggestions with:
   - Project assignment
   - Time range
   - Description
   - Billable status
   - Confidence level (high/medium/low)
   - Reasoning
7. **Review & Apply** - User selects which suggestions to apply
8. **Create Entries** - Selected suggestions are created as time entries

### Session Merging

To handle days with 300-500 activity sessions, the autofill feature:

- Merges adjacent sessions of the same app within 10 minutes
- Combines window titles from merged sessions
- Limits descriptions to 200 characters with "..." suffix
- Sorts by duration and takes top 50 sessions
- This reduces API token usage by ~90%

### AI Prompt Strategy

The AI is given:
- Today's date
- List of active projects (ID, name, client name)
- Merged activity sessions (app name, window title, duration, time range)

The prompt instructs the AI to:
- Only suggest entries for activities that clearly relate to projects
- Group consecutive work on the same project
- Ignore casual browsing, social media, email (unless window titles indicate project work)
- Be conservative when uncertain
- Provide realistic time ranges based on activity data
- Mark billable work appropriately

### Structured Output

The AI uses the Vercel AI SDK's `generateObject` function to return structured data that conforms to this schema:

```typescript
{
  suggestions: [
    {
      projectId: number,
      description: string,
      startTime: ISO8601 string,
      endTime: ISO8601 string,
      billable: boolean,
      confidence: "high" | "medium" | "low",
      reasoning: string
    }
  ]
}
```

## Usage

### Basic Flow

1. Navigate to the Time Tracking page
2. Select the date you want to autofill
3. Click the "Autofill" button (lightning bolt icon) next to "Project Tracking"
4. Wait for AI analysis (typically 3-10 seconds)
5. Review the suggested time entries in the dialog
6. Check/uncheck suggestions as desired
7. Click "Apply X Entries" to create them

### Review Dialog Features

- **Select All/None** - Toggle all suggestions at once
- **Individual Selection** - Click any suggestion to toggle
- **Color-Coded Confidence**:
  - Green = High confidence
  - Yellow = Medium confidence  
  - Orange = Low confidence
- **Project Color Indicator** - Visual project identification
- **Time Range & Duration** - Clear time display
- **Reasoning** - AI explanation for each suggestion
- **Billable Badge** - Shows which entries are billable

### Tips for Best Results

1. **Create Clear Project Names** - Use descriptive names that relate to apps/activities
2. **Keep Projects Active** - Autofill only considers active/on-hold projects
3. **Use Project-Specific Tools** - Apps with clear window titles (e.g., "VSCode - project-name") work best
4. **Review Low Confidence** - Manually verify entries with low confidence
5. **Edit After Creation** - You can still edit/delete auto-created entries

## API Endpoint

**POST** `/api/time/autofill`

### Request Body
```json
{
  "date": "2024-01-15" // YYYY-MM-DD format
}
```

### Response
```json
{
  "suggestions": [...],
  "activityCount": 347,     // Original session count
  "mergedCount": 48        // After merging
}
```

### Error Responses

- `400` - Missing date parameter
- `500` - OpenAI API key not configured
- `500` - Invalid API key
- `500` - AI generation failure

## File Structure

```
apps/admin-dashboard/
├── app/
│   ├── api/
│   │   └── time/
│   │       └── autofill/
│   │           └── route.ts              # API endpoint
│   └── time/
│       └── components/
│           ├── DayTimeline.tsx            # Main timeline component (button + state)
│           └── timeline/
│               ├── AutofillDialog.tsx     # Suggestion review dialog
│               └── utils.ts               # Session merging logic
└── .env                                   # OPENAI_API_KEY configuration
```

## Cost Considerations

### Token Usage per Request

- **Input**: ~2,000-4,000 tokens (depends on session count and project list)
- **Output**: ~500-1,500 tokens (depends on suggestions)

### Monthly Estimate

If you autofill 5 days per week:
- ~20-22 autofill requests per month
- **Total cost**: ~$0.20-0.65/month

## Troubleshooting

### "OpenAI API key not configured"

1. Check `.env` file has `OPENAI_API_KEY=sk-proj-...`
2. Restart development server after adding key
3. Verify key is valid at https://platform.openai.com/api-keys

### "No suggestions generated"

Possible causes:
- No activity sessions for that date
- Activity doesn't clearly match any projects
- Only non-work apps used (browsers, email, social media)

Solutions:
- Try a different day
- Create more specific projects
- Review activity sessions manually

### "Failed to generate suggestions"

Check:
- OpenAI API status (https://status.openai.com)
- API key has credits available
- Network connectivity
- Check browser console for detailed errors

### Suggestions seem inaccurate

Tips:
- Use low confidence suggestions as hints only
- Edit descriptions/times after creation
- The AI improves with clearer project names and app usage patterns
- Consider manually creating entries for complex work

## Future Enhancements

Potential improvements:
- User feedback loop to improve AI accuracy
- Project-to-app mapping rules
- Confidence threshold filter
- Batch autofill for multiple days
- Custom AI prompts per user/project
- Integration with calendar events
- Learning from user edits to improve future suggestions
