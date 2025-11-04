# Email Notification System - Phase 13

## Overview

Phase 13 implements a comprehensive email notification system using **JMAP** (JSON Meta Application Protocol) for sending emails. JMAP is a modern, RESTful email protocol that works with Edge runtimes (unlike traditional SMTP) and is supported by providers like Fastmail, Cyrus IMAP, and others.

## Architecture

### Package Structure

```
packages/email/
├── src/
│   ├── jmap-client.ts      # JMAP email sending functionality
│   ├── templates.ts         # HTML/text email templates
│   └── index.ts            # Public exports
├── package.json
├── tsconfig.json
└── README.md
```

### Shared Package: `@freelance-os/email`

This package provides:
- **JMAP Email Client**: Edge-compatible email sending (no Node.js dependencies)
- **Email Templates**: Pre-styled HTML and plain-text templates
- **Type Safety**: Full TypeScript support with shared types

## Features Implemented

### 1. Invoice Notifications

**Automatic Sending**: When an invoice status changes from `draft` to `sent`, an email is automatically sent to the client.

**Manual Sending**: "Send Invoice" button on invoice detail page (`/invoices/[id]`)

**API Endpoint**: `POST /api/invoices/[id]/send`

**Template**: Professional invoice notification with:
- Invoice details (number, amount, due date)
- Direct link to client portal (if configured)
- Company branding
- Payment terms and notes

### 2. Welcome Emails

**Manual Sending**: "Welcome Email" button on client detail page (`/clients/[id]`)

**API Endpoint**: `POST /api/clients/[id]/welcome`

**Template**: Client onboarding email with:
- Welcome message
- Client portal features overview
- Portal access link (if configured)
- Company branding

### 3. Payment Reminders

**API Endpoint**: `POST /api/notifications/reminders`

**Types**:
- **Upcoming**: Reminders for invoices due in the next X days (default: 7)
- **Overdue**: Notices for past-due invoices with auto-status update to `overdue`

**Request Body**:
```json
{
  "type": "upcoming",  // or "overdue"
  "daysThreshold": 7   // for upcoming reminders
}
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

## Email Templates

All templates include:
- ✅ Professional HTML design with inline CSS
- ✅ Dark mode support via email client CSS
- ✅ Plain-text fallback version
- ✅ Mobile-responsive layout
- ✅ Branded header/footer
- ✅ Call-to-action buttons

### Template Functions

```typescript
// Invoice sent notification
generateInvoiceSentEmail({
  invoice: InvoiceWithClient,
  companyName: string,
  portalUrl?: string,
})

// Payment reminder (upcoming)
generatePaymentReminderEmail({
  invoice: InvoiceWithClient,
  companyName: string,
  portalUrl?: string,
  daysUntilDue: number,
})

// Overdue invoice notice
generateOverdueInvoiceEmail({
  invoice: InvoiceWithClient,
  companyName: string,
  portalUrl?: string,
  daysOverdue: number,
})

// Welcome email
generateWelcomeEmail({
  client: { name, email },
  companyName: string,
  portalUrl?: string,
})
```

## Configuration

### Environment Variables

Add to your `.env` file:

```bash
# Required: JMAP Email Configuration
JMAP_TOKEN=your_jmap_api_token
JMAP_USERNAME=sender@example.com
JMAP_HOSTNAME=api.fastmail.com  # Optional, defaults to Fastmail

# Optional: Branding
COMPANY_NAME="Your Company Name"

# Optional: Portal URL (used in email links)
CLIENT_PORTAL_URL=https://portal.yourdomain.com
```

### Getting JMAP Credentials (Fastmail)

1. **Sign in to Fastmail**: https://www.fastmail.com
2. **Settings → Password & Security**
3. **Create App Password**:
   - Name: "Freelance-OS Email"
   - Access: Mail (send/receive)
4. **Copy the generated token** → Use as `JMAP_TOKEN`
5. **Set `JMAP_USERNAME`** to your Fastmail email address

### Other JMAP Providers

JMAP is supported by:
- **Fastmail** (recommended, best JMAP implementation)
- **Cyrus IMAP** (open-source server)
- **Apple iCloud** (limited support)

For other providers, set `JMAP_HOSTNAME` to their JMAP API endpoint.

## Usage Examples

### Sending Invoice Email (Automatic)

```typescript
// In invoice update API route
const response = await fetch(`/api/invoices/${id}`, {
  method: 'PUT',
  body: JSON.stringify({ status: 'sent' }),
});
// Email sent automatically when status changes to 'sent'
```

### Sending Invoice Email (Manual)

```typescript
const response = await fetch(`/api/invoices/${invoiceId}/send`, {
  method: 'POST',
});

const result = await response.json();
// { success: true, message: "Invoice sent to client@example.com", invoice: {...} }
```

### Sending Welcome Email

```typescript
const response = await fetch(`/api/clients/${clientId}/welcome`, {
  method: 'POST',
});

const result = await response.json();
// { success: true, message: "Welcome email sent to client@example.com" }
```

### Batch Payment Reminders

```typescript
// Send reminders for invoices due in next 7 days
const response = await fetch('/api/notifications/reminders', {
  method: 'POST',
  body: JSON.stringify({
    type: 'upcoming',
    daysThreshold: 7,
  }),
});

// Send overdue notices
const response = await fetch('/api/notifications/reminders', {
  method: 'POST',
  body: JSON.stringify({ type: 'overdue' }),
});
```

## API Routes Reference

### Invoice Email

**Endpoint**: `POST /api/invoices/[id]/send`

**Description**: Send invoice email to client. Updates status to `sent` if currently `draft`.

**Response**:
```json
{
  "success": true,
  "message": "Invoice sent to client@example.com",
  "invoice": { /* updated invoice object */ }
}
```

**Error Codes**:
- `400`: Invalid invoice ID
- `404`: Invoice not found
- `503`: Email service not configured (missing JMAP credentials)
- `500`: Failed to send email

### Welcome Email

**Endpoint**: `POST /api/clients/[id]/welcome`

**Description**: Send welcome email to client.

**Response**:
```json
{
  "success": true,
  "message": "Welcome email sent to client@example.com"
}
```

### Payment Reminders

**Endpoint**: `POST /api/notifications/reminders`

**Request Body**:
```json
{
  "type": "upcoming" | "overdue",
  "daysThreshold": 7  // Optional, for upcoming only
}
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

## Automation Ideas (Future)

### Scheduled Payment Reminders

Use cron jobs or scheduled tasks to automatically send reminders:

```bash
# Send reminders for invoices due in 7 days (daily at 9 AM)
0 9 * * * curl -X POST https://admin.yourdomain.com/api/notifications/reminders \
  -H "Content-Type: application/json" \
  -d '{"type":"upcoming","daysThreshold":7}'

# Send overdue notices (daily at 10 AM)
0 10 * * * curl -X POST https://admin.yourdomain.com/api/notifications/reminders \
  -H "Content-Type: application/json" \
  -d '{"type":"overdue"}'
```

### Next.js Edge Functions (Vercel Cron)

```typescript
// app/api/cron/reminders/route.ts
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Send upcoming reminders
  await fetch(`${process.env.ADMIN_DASHBOARD_URL}/api/notifications/reminders`, {
    method: 'POST',
    body: JSON.stringify({ type: 'upcoming', daysThreshold: 7 }),
  });

  return Response.json({ success: true });
}
```

Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/reminders",
      "schedule": "0 9 * * *"
    }
  ]
}
```

## Error Handling

### Client-Side

```typescript
try {
  const response = await fetch('/api/invoices/123/send', { method: 'POST' });
  
  if (!response.ok) {
    const error = await response.json();
    console.error('Email failed:', error.details || error.error);
    // Show user-friendly message
  }
} catch (error) {
  console.error('Network error:', error);
}
```

### Server-Side

Email failures are logged but **do not fail the entire request**:

```typescript
// Invoice update with email notification
const invoice = await prisma.invoice.update({ /* ... */ });

try {
  await sendEmail({ /* ... */ });
} catch (emailError) {
  console.error('[Invoice] Email failed:', emailError);
  // Continue - invoice was updated successfully
}
```

## Testing

### Manual Testing Checklist

1. **Configure JMAP credentials** in `.env`
2. **Send test invoice**:
   - Create draft invoice
   - Click "Send Invoice" button
   - Verify email received
   - Check invoice status changed to `sent`
3. **Send welcome email**:
   - Click "Welcome Email" on client page
   - Verify email received
4. **Test reminders** (via API client or curl):
   ```bash
   curl -X POST http://localhost:3010/api/notifications/reminders \
     -H "Content-Type: application/json" \
     -d '{"type":"upcoming","daysThreshold":7}'
   ```

### Debugging

Enable detailed logging:
```typescript
// In jmap-client.ts or templates.ts
console.log('[JMAP] Sending email to:', to);
console.log('[JMAP] Subject:', subject);
```

Check browser console for:
- API response errors
- Success/failure messages

Check server logs for:
- JMAP API errors
- Missing environment variables
- Email sending failures

## Security Considerations

1. **Environment Variables**: Never commit `JMAP_TOKEN` to git
2. **Email Validation**: Client emails are validated by Prisma schema
3. **Rate Limiting**: Consider adding rate limits to email endpoints
4. **Authentication**: Email APIs inherit Next.js route protection (if added)
5. **JMAP Token Scope**: Use minimal permissions (mail send only)

## Performance

- **Edge Compatible**: JMAP uses `fetch()` API, works in Edge runtime
- **No Heavy Dependencies**: No Nodemailer, no SMTP libraries
- **Async Operations**: Email sending doesn't block UI updates
- **Batch Processing**: Payment reminders process multiple invoices efficiently

## Troubleshooting

### "Email service not configured"

**Solution**: Set `JMAP_TOKEN` and `JMAP_USERNAME` in `.env`

### "Failed to send email via JMAP"

**Possible causes**:
1. Invalid JMAP token (regenerate app password)
2. Incorrect `JMAP_USERNAME` (must match token email)
3. Network/firewall blocking JMAP API
4. Token expired or revoked

**Debug**:
```bash
# Test JMAP connection manually
curl https://api.fastmail.com/.well-known/jmap \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Emails not arriving

**Check**:
1. Spam folder
2. Email provider logs (Fastmail web interface)
3. Server console for send errors
4. Client email address is correct

## Future Enhancements

- [ ] Email delivery status tracking
- [ ] Resend failed emails
- [ ] Email templates customization UI
- [ ] Attachment support (invoice PDFs)
- [ ] Multi-language email templates
- [ ] Email analytics (open/click tracking)
- [ ] Bulk email operations
- [ ] Email queue for rate limiting

## Summary

Phase 13 provides a complete, production-ready email notification system:

✅ **JMAP Email Client** - Modern, edge-compatible email sending  
✅ **Professional Templates** - Invoice, reminder, overdue, welcome emails  
✅ **Automatic & Manual** - Auto-send on status change + manual buttons  
✅ **Batch Operations** - Payment reminder API for scheduled jobs  
✅ **Error Handling** - Graceful failures with detailed logging  
✅ **Type Safety** - Full TypeScript integration  
✅ **Documentation** - Comprehensive setup and usage guides  

**Next Phase**: Phase 14 - UI Polish and refinements
