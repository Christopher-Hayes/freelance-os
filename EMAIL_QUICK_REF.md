# Email Notifications - Quick Reference

## Setup (5 minutes)

### 1. Get JMAP Credentials

**Fastmail** (recommended):
1. Login → Settings → Password & Security
2. Create App Password → Name: "Freelance-OS" → Access: Mail
3. Copy the generated token

**Other providers**: Check if they support JMAP API

### 2. Configure Environment

Add to `.env`:
```bash
JMAP_TOKEN=your_token_here
JMAP_USERNAME=your@email.com
JMAP_HOSTNAME=api.fastmail.com  # Optional

# Optional branding
COMPANY_NAME="Your Company Name"
CLIENT_PORTAL_URL=https://portal.yourdomain.com
```

### 3. Test

1. Navigate to any invoice: `/invoices/[id]`
2. Click **"Send Invoice"** button
3. Check client's email inbox

## Features

### Automatic Email Sending

When you change invoice status to "sent", email is automatically sent:

```typescript
// This triggers an email automatically
PUT /api/invoices/123
{ "status": "sent" }
```

### Manual Email Sending

#### Send Invoice
- **Where**: Invoice detail page (`/invoices/[id]`)
- **Button**: "Send Invoice" (indigo button with email icon)
- **Effect**: Sends invoice email + updates status to "sent" if draft

#### Welcome Email
- **Where**: Client detail page (`/clients/[id]`)
- **Button**: "Welcome Email" (indigo button with email icon)
- **Effect**: Sends welcome/onboarding email to client

### Batch Operations (API)

#### Payment Reminders

**Upcoming invoices** (due in next 7 days):
```bash
curl -X POST http://localhost:3010/api/notifications/reminders \
  -H "Content-Type: application/json" \
  -d '{"type":"upcoming","daysThreshold":7}'
```

**Overdue invoices**:
```bash
curl -X POST http://localhost:3010/api/notifications/reminders \
  -H "Content-Type: application/json" \
  -d '{"type":"overdue"}'
```

## Email Templates

### 1. Invoice Sent
- **Trigger**: Invoice status → "sent" OR manual send
- **Content**: Invoice details, amount, due date, payment link
- **Color**: Blue theme

### 2. Payment Reminder
- **Trigger**: Batch API (upcoming)
- **Content**: Reminder X days before due, invoice details
- **Color**: Amber/warning theme

### 3. Overdue Notice
- **Trigger**: Batch API (overdue)
- **Content**: Overdue notice with days past due
- **Color**: Red/urgent theme
- **Side Effect**: Updates invoice status to "overdue"

### 4. Welcome Email
- **Trigger**: Manual button on client page
- **Content**: Welcome message, portal features, access link
- **Color**: Green/success theme

## API Endpoints

### Send Invoice Email
```
POST /api/invoices/[id]/send
```
**Response**:
```json
{
  "success": true,
  "message": "Invoice sent to client@example.com",
  "invoice": { /* updated invoice */ }
}
```

### Send Welcome Email
```
POST /api/clients/[id]/welcome
```
**Response**:
```json
{
  "success": true,
  "message": "Welcome email sent to client@example.com"
}
```

### Batch Payment Reminders
```
POST /api/notifications/reminders
Body: { "type": "upcoming" | "overdue", "daysThreshold": 7 }
```
**Response**:
```json
{
  "success": true,
  "type": "upcoming",
  "count": 3,
  "results": [
    {
      "invoiceId": 1,
      "invoiceNumber": "INV-20250103-001",
      "clientEmail": "client@example.com",
      "status": "sent",
      "daysUntilDue": 5
    }
  ]
}
```

## Troubleshooting

### "Email service not configured"
**Fix**: Set `JMAP_TOKEN` and `JMAP_USERNAME` in `.env`

### "Failed to send email"
**Check**:
1. Token is valid (regenerate if needed)
2. `JMAP_USERNAME` matches token email
3. Check server console for detailed error

### Email not received
**Check**:
1. Spam folder
2. Client email address is correct
3. Email provider logs (Fastmail web interface)

### Test JMAP connection
```bash
curl https://api.fastmail.com/.well-known/jmap \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Automation (Cron Jobs)

### Daily Reminders

**Linux Cron**:
```cron
# 9 AM daily - upcoming invoices (7 days)
0 9 * * * curl -X POST https://admin.yourdomain.com/api/notifications/reminders \
  -H "Content-Type: application/json" \
  -d '{"type":"upcoming","daysThreshold":7}'

# 10 AM daily - overdue invoices
0 10 * * * curl -X POST https://admin.yourdomain.com/api/notifications/reminders \
  -H "Content-Type: application/json" \
  -d '{"type":"overdue"}'
```

**Vercel Cron** (see `EMAIL_NOTIFICATIONS.md` for setup)

## Package Structure

```
packages/email/
├── src/
│   ├── jmap-client.ts    # JMAP email sending
│   ├── templates.ts       # Email templates (HTML + text)
│   └── index.ts          # Public API
└── package.json
```

## Import in Your Code

```typescript
import { sendEmail, generateInvoiceSentEmail } from '@freelance-os/email';

// Generate email content
const emailContent = generateInvoiceSentEmail({
  invoice: { /* invoice with client data */ },
  companyName: 'Acme Corp',
  portalUrl: 'https://portal.example.com',
});

// Send email
await sendEmail({
  to: 'client@example.com',
  ...emailContent,  // { subject, text, html }
});
```

## Next Steps

1. **Test all email types** (invoice, welcome, reminders)
2. **Set up automation** (cron jobs for reminders)
3. **Customize templates** (edit `packages/email/src/templates.ts`)
4. **Monitor logs** (check server console for email errors)

## Full Documentation

See `EMAIL_NOTIFICATIONS.md` for:
- Complete API reference
- Template customization guide
- Advanced automation setups
- Security considerations
- Performance notes

---

**Phase**: 13 (Complete)  
**Package**: `@freelance-os/email`  
**Status**: ✅ Production Ready
