# @freelance-os/email

Email notification service using JMAP (compatible with Fastmail and other JMAP providers).

## Features

- **JMAP Email Client**: Edge runtime compatible (no Node.js dependencies)
- **Email Templates**: Pre-built templates for:
  - Invoice sent notifications
  - Payment reminders
  - Overdue notices
  - Welcome emails for new clients

## Setup

### Environment Variables

Add to your `.env` file:

```bash
JMAP_TOKEN=your_jmap_api_token
JMAP_USERNAME=sender@example.com
JMAP_HOSTNAME=api.fastmail.com  # Optional, defaults to Fastmail
```

### Getting JMAP Credentials (Fastmail)

1. Log in to Fastmail
2. Go to Settings → Password & Security
3. Create an "App Password" with Mail permissions
4. Use that token as `JMAP_TOKEN`

## Usage

### Send Invoice Notification

```typescript
import { sendEmail, generateInvoiceSentEmail } from '@freelance-os/email';

const emailContent = generateInvoiceSentEmail({
  invoice: invoiceWithClient,
  companyName: 'Acme Corp',
  portalUrl: 'https://portal.example.com',
});

await sendEmail({
  to: invoice.client.email,
  ...emailContent,
});
```

### Send Welcome Email

```typescript
import { sendEmail, generateWelcomeEmail } from '@freelance-os/email';

const emailContent = generateWelcomeEmail({
  client: { name: 'John Doe', email: 'john@example.com' },
  companyName: 'Acme Corp',
  portalUrl: 'https://portal.example.com',
});

await sendEmail({
  to: client.email,
  ...emailContent,
});
```

## Templates

All templates return `{ subject, text, html }` objects.

### Available Templates

- `generateInvoiceSentEmail(data)` - Sent when invoice status changes to "sent"
- `generatePaymentReminderEmail(data)` - Reminder X days before due date
- `generateOverdueInvoiceEmail(data)` - Notice for overdue invoices
- `generateWelcomeEmail(data)` - Welcome email for new clients

## Edge Runtime Compatible

This package uses only `fetch` API and is compatible with Vercel Edge Runtime and Cloudflare Workers.
