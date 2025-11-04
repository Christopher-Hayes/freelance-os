# RescueTime Integration Guide

## Overview

The admin dashboard now includes integration with RescueTime to import activity tracking data. This allows you to backfill activity data from RescueTime into your Freelance-OS activity sessions.

## Features

1. **Settings Page**: Configure your RescueTime API key
2. **Empty State UI**: When no activity data exists for a day, you'll see an "Import from RescueTime" button
3. **One-Click Import**: Click the button to fetch and import RescueTime data for that specific day

## Setup Instructions

### 1. Get Your RescueTime API Key

1. Go to [RescueTime API Management](https://www.rescuetime.com/anapi/manage)
2. Create a new API key (if you don't have one)
3. Copy the API key

### 2. Configure in Freelance-OS

1. Navigate to **Settings** in the admin dashboard
2. Paste your RescueTime API key in the "RescueTime API Key" field
3. Click "Save Settings"

### 3. Import Activity Data

1. Navigate to **Time Tracking**
2. Select a date that has no activity data
3. You'll see an empty state with "Import from RescueTime" button
4. Click the button to import activity data for that day

## How It Works

### Data Transformation

RescueTime API returns activity data with the following structure (using `restrict_kind=document`):
- **Document**: The specific file name, web page title, or document (e.g., "operatormenu.cs", "github.com/issues")
- **Activity Name**: The parent application or website name (e.g., "Visual Studio Code", "Chrome")
- **Category**: RescueTime's category (e.g., "Editing & IDEs", "Communication & Scheduling")
- **Time Spent**: Duration in seconds
- **Timestamp**: When the activity occurred (5-minute granularity)

This data is transformed into our `activity_sessions` table:
- `app_class`: Application or website name (e.g., "Visual Studio Code")
- `window_title`: Document/file name if available, otherwise category (e.g., "operatormenu.cs" or "Editing & IDEs")
- `start_time`: Session start timestamp (UTC)
- `end_time`: Session end timestamp (UTC)
- `duration_seconds`: Duration in seconds

**Note**: The document-level API provides much more granular data, showing individual files in VS Code, specific web pages in browsers, and document names in productivity apps. This matches the detail level of the local activity tracking utility.

### Duplicate Prevention

The import endpoint checks if activity data already exists for the selected date. If data exists, it will prevent re-import and show a message.

### API Endpoints

#### GET/PUT /api/settings
- **GET**: Retrieve settings (optionally filter by key)
- **PUT**: Update or create a setting (upsert)

#### POST /api/activity-sessions/import-rescuetime
- **Body**: `{ date: "YYYY-MM-DD" }`
- **Response**: Number of sessions imported
- **Errors**: 
  - 400: Missing API key or invalid date
  - API key not configured
  - Data already exists for this date

## Database Schema

### settings Table

```prisma
model Setting {
  id        Int      @id @default(autoincrement())
  key       String   @unique
  value     String   @db.Text
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt()
}
```

Currently stores:
- `rescuetime_api_key`: Your RescueTime API key

## Technical Notes

### RescueTime API Limitations

- Free plan: Data syncs every 30 minutes
- Premium plan: Data syncs every 3 minutes
- Activity data is provided in 5-minute buckets (finest granularity available)
- API key must be created at [RescueTime API Management](https://www.rescuetime.com/anapi/manage)

### Data Privacy

- API keys are stored in the database as plain text (consider encryption in production)
- RescueTime data includes detailed application usage
- Only imports data when explicitly requested

## Future Enhancements

- [ ] Automatic daily sync
- [ ] Batch import for date ranges
- [ ] API key encryption
- [ ] Import progress indicator for large datasets
- [ ] Conflict resolution UI (for existing data)
- [ ] Activity categorization mapping

## Troubleshooting

### "RescueTime API key not configured"
- Go to Settings and add your API key

### "No activity data found in RescueTime for this date"
- Check that RescueTime was actively tracking on that date
- Verify your computer had the RescueTime app running

### "Already have X activity sessions for this date"
- Data has already been imported
- Delete existing sessions if you want to re-import

### API Key Invalid
- Regenerate your API key at RescueTime
- Update it in Settings
