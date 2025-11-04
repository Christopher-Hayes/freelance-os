/**
 * Email Templates for Invoice Notifications
 * Provides HTML and plain-text email templates for various invoice-related communications
 */

// Import types - use any to avoid workspace resolution issues
type Invoice = any;
type Client = any;

interface InvoiceEmailData {
  invoice: Invoice & {
    client: Pick<Client, 'name' | 'email' | 'company'>;
  };
  companyName?: string;
  portalUrl?: string;
}

/**
 * Generate invoice sent email (when admin marks invoice as "sent")
 */
export function generateInvoiceSentEmail(data: InvoiceEmailData) {
  const { invoice, companyName = 'Your Freelancer', portalUrl } = data;
  const dueDate = new Date(invoice.dueDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const subject = `Invoice ${invoice.invoiceNumber} from ${companyName}`;

  const text = `
Hi ${invoice.client.name},

Thank you for your business! Your invoice is ready.

Invoice Number: ${invoice.invoiceNumber}
Amount: $${invoice.amount}
Due Date: ${dueDate}

${invoice.notes ? `Notes:\n${invoice.notes}\n\n` : ''}${portalUrl ? `You can view and download this invoice at:\n${portalUrl}/invoices/${invoice.id}\n\n` : ''}If you have any questions, please don't hesitate to reach out.

Best regards,
${companyName}
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #4F46E5; color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background-color: #ffffff; padding: 30px 20px; border: 1px solid #e5e7eb; border-top: none; }
    .invoice-details { background-color: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .detail-row:last-child { border-bottom: none; }
    .label { font-weight: 600; color: #6b7280; }
    .value { color: #111827; }
    .amount { font-size: 24px; font-weight: bold; color: #4F46E5; }
    .button { display: inline-block; background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
    .notes { background-color: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; margin: 20px 0; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">Invoice Ready</h1>
    </div>
    <div class="content">
      <p>Hi ${invoice.client.name},</p>
      <p>Thank you for your business! Your invoice is ready.</p>
      
      <div class="invoice-details">
        <div class="detail-row">
          <span class="label">Invoice Number:</span>
          <span class="value">${invoice.invoiceNumber}</span>
        </div>
        <div class="detail-row">
          <span class="label">Amount Due:</span>
          <span class="value amount">$${invoice.amount}</span>
        </div>
        <div class="detail-row">
          <span class="label">Due Date:</span>
          <span class="value">${dueDate}</span>
        </div>
      </div>

      ${invoice.notes ? `<div class="notes"><strong>Notes:</strong><br>${invoice.notes.replace(/\n/g, '<br>')}</div>` : ''}

      ${portalUrl ? `<div style="text-align: center;"><a href="${portalUrl}/invoices/${invoice.id}" class="button">View Invoice</a></div>` : ''}

      <p>If you have any questions, please don't hesitate to reach out.</p>
      <p>Best regards,<br>${companyName}</p>
    </div>
    <div class="footer">
      <p>${companyName} • Invoice Notification</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

/**
 * Generate payment reminder email (X days before due date)
 */
export function generatePaymentReminderEmail(data: InvoiceEmailData & { daysUntilDue: number }) {
  const { invoice, companyName = 'Your Freelancer', portalUrl, daysUntilDue } = data;
  const dueDate = new Date(invoice.dueDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const subject = `Reminder: Invoice ${invoice.invoiceNumber} due in ${daysUntilDue} days`;

  const text = `
Hi ${invoice.client.name},

This is a friendly reminder that invoice ${invoice.invoiceNumber} is due in ${daysUntilDue} days.

Invoice Number: ${invoice.invoiceNumber}
Amount: $${invoice.amount}
Due Date: ${dueDate}

${portalUrl ? `You can view and pay this invoice at:\n${portalUrl}/invoices/${invoice.id}\n\n` : ''}Thank you for your prompt attention to this matter.

Best regards,
${companyName}
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #F59E0B; color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background-color: #ffffff; padding: 30px 20px; border: 1px solid #e5e7eb; border-top: none; }
    .reminder-box { background-color: #FEF3C7; padding: 20px; border-left: 4px solid #F59E0B; margin: 20px 0; border-radius: 4px; }
    .invoice-details { background-color: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .detail-row:last-child { border-bottom: none; }
    .label { font-weight: 600; color: #6b7280; }
    .value { color: #111827; }
    .amount { font-size: 24px; font-weight: bold; color: #F59E0B; }
    .button { display: inline-block; background-color: #F59E0B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">Payment Reminder</h1>
    </div>
    <div class="content">
      <p>Hi ${invoice.client.name},</p>
      
      <div class="reminder-box">
        <p style="margin: 0; font-size: 16px;"><strong>Friendly Reminder:</strong> Invoice ${invoice.invoiceNumber} is due in <strong>${daysUntilDue} days</strong>.</p>
      </div>
      
      <div class="invoice-details">
        <div class="detail-row">
          <span class="label">Invoice Number:</span>
          <span class="value">${invoice.invoiceNumber}</span>
        </div>
        <div class="detail-row">
          <span class="label">Amount Due:</span>
          <span class="value amount">$${invoice.amount}</span>
        </div>
        <div class="detail-row">
          <span class="label">Due Date:</span>
          <span class="value">${dueDate}</span>
        </div>
      </div>

      ${portalUrl ? `<div style="text-align: center;"><a href="${portalUrl}/invoices/${invoice.id}" class="button">View & Pay Invoice</a></div>` : ''}

      <p>Thank you for your prompt attention to this matter.</p>
      <p>Best regards,<br>${companyName}</p>
    </div>
    <div class="footer">
      <p>${companyName} • Payment Reminder</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

/**
 * Generate overdue invoice email
 */
export function generateOverdueInvoiceEmail(data: InvoiceEmailData & { daysOverdue: number }) {
  const { invoice, companyName = 'Your Freelancer', portalUrl, daysOverdue } = data;
  const dueDate = new Date(invoice.dueDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const subject = `Overdue: Invoice ${invoice.invoiceNumber} is ${daysOverdue} days past due`;

  const text = `
Hi ${invoice.client.name},

This is a notice that invoice ${invoice.invoiceNumber} is now ${daysOverdue} days overdue.

Invoice Number: ${invoice.invoiceNumber}
Amount: $${invoice.amount}
Due Date: ${dueDate}
Days Overdue: ${daysOverdue}

${portalUrl ? `Please view and pay this invoice at:\n${portalUrl}/invoices/${invoice.id}\n\n` : ''}If you have any questions or concerns about this invoice, please contact me as soon as possible.

Best regards,
${companyName}
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #DC2626; color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background-color: #ffffff; padding: 30px 20px; border: 1px solid #e5e7eb; border-top: none; }
    .overdue-box { background-color: #FEE2E2; padding: 20px; border-left: 4px solid #DC2626; margin: 20px 0; border-radius: 4px; }
    .invoice-details { background-color: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .detail-row:last-child { border-bottom: none; }
    .label { font-weight: 600; color: #6b7280; }
    .value { color: #111827; }
    .amount { font-size: 24px; font-weight: bold; color: #DC2626; }
    .button { display: inline-block; background-color: #DC2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">Overdue Invoice Notice</h1>
    </div>
    <div class="content">
      <p>Hi ${invoice.client.name},</p>
      
      <div class="overdue-box">
        <p style="margin: 0; font-size: 16px;"><strong>Notice:</strong> Invoice ${invoice.invoiceNumber} is now <strong>${daysOverdue} days overdue</strong>.</p>
      </div>
      
      <div class="invoice-details">
        <div class="detail-row">
          <span class="label">Invoice Number:</span>
          <span class="value">${invoice.invoiceNumber}</span>
        </div>
        <div class="detail-row">
          <span class="label">Amount Due:</span>
          <span class="value amount">$${invoice.amount}</span>
        </div>
        <div class="detail-row">
          <span class="label">Due Date:</span>
          <span class="value">${dueDate}</span>
        </div>
        <div class="detail-row">
          <span class="label">Days Overdue:</span>
          <span class="value" style="color: #DC2626; font-weight: bold;">${daysOverdue}</span>
        </div>
      </div>

      ${portalUrl ? `<div style="text-align: center;"><a href="${portalUrl}/invoices/${invoice.id}" class="button">Pay Now</a></div>` : ''}

      <p>If you have any questions or concerns about this invoice, please contact me as soon as possible.</p>
      <p>Best regards,<br>${companyName}</p>
    </div>
    <div class="footer">
      <p>${companyName} • Overdue Notice</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

/**
 * Generate welcome email for new clients
 */
export function generateWelcomeEmail(data: {
  client: Pick<Client, 'name' | 'email'>;
  companyName?: string;
  portalUrl?: string;
}) {
  const { client, companyName = 'Your Freelancer', portalUrl } = data;

  const subject = `Welcome to ${companyName}!`;

  const text = `
Hi ${client.name},

Welcome! I'm excited to work with you.

${portalUrl ? `I've set up a client portal where you can:\n- View all your projects and their status\n- Track time spent on your work\n- View and download invoices\n- Monitor project progress\n\nAccess your portal at: ${portalUrl}\n\n` : ''}I'll keep you updated on progress and send invoices through this system. If you have any questions at any time, please don't hesitate to reach out.

Looking forward to working together!

Best regards,
${companyName}
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #10B981; color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background-color: #ffffff; padding: 30px 20px; border: 1px solid #e5e7eb; border-top: none; }
    .features { background-color: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0; }
    .feature { padding: 10px 0; display: flex; align-items: start; }
    .feature-icon { color: #10B981; margin-right: 10px; font-size: 20px; }
    .button { display: inline-block; background-color: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">Welcome!</h1>
    </div>
    <div class="content">
      <p>Hi ${client.name},</p>
      <p>Welcome! I'm excited to work with you.</p>
      
      ${portalUrl ? `
      <p>I've set up a client portal where you can:</p>
      <div class="features">
        <div class="feature">
          <span class="feature-icon">✓</span>
          <span>View all your projects and their status</span>
        </div>
        <div class="feature">
          <span class="feature-icon">✓</span>
          <span>Track time spent on your work</span>
        </div>
        <div class="feature">
          <span class="feature-icon">✓</span>
          <span>View and download invoices</span>
        </div>
        <div class="feature">
          <span class="feature-icon">✓</span>
          <span>Monitor project progress</span>
        </div>
      </div>
      <div style="text-align: center;">
        <a href="${portalUrl}" class="button">Access Client Portal</a>
      </div>
      ` : ''}

      <p>I'll keep you updated on progress and send invoices through this system. If you have any questions at any time, please don't hesitate to reach out.</p>
      <p>Looking forward to working together!</p>
      <p>Best regards,<br>${companyName}</p>
    </div>
    <div class="footer">
      <p>${companyName} • Welcome</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}
