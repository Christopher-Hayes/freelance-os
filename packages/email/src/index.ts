/**
 * Email Service Package
 * Provides JMAP email functionality and templates for invoice notifications
 */

export { sendEmail } from './jmap-client';
export type { JMAPConfig } from './jmap-client';
export {
  generateInvoiceSentEmail,
  generatePaymentReminderEmail,
  generateOverdueInvoiceEmail,
  generateWelcomeEmail,
} from './templates';
