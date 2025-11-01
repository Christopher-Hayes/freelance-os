# Invoice System Quick Reference

## Overview
The Invoice Management system allows you to create, manage, and track invoices for your freelance business. You can create invoices manually or auto-generate them from billable time entries.

## 🚀 Quick Start

### Creating an Invoice Manually
1. Go to **Invoices** → **Create Invoice**
2. Select **Manual Invoice** mode
3. Fill in the form:
   - Invoice number (or click "Generate" for auto-number)
   - Select client (required)
   - Select project (optional)
   - Enter amount
   - Set issue date and due date
   - Add notes if needed
4. Click **Create Invoice**

### Auto-Generating from Time Entries
1. Go to **Invoices** → **Create Invoice**
2. Select **Generate from Time Entries** mode
3. Fill in the form:
   - Select client (required)
   - Select project (optional - filters time entries)
   - Enter hourly rate
   - Optionally set start/end dates (filters time entries)
   - Set payment due in days (default: 30)
4. Click **Generate Invoice**
5. System will:
   - Find all billable time entries matching criteria
   - Calculate total hours
   - Multiply hours × hourly rate = invoice amount
   - Auto-generate invoice number
   - Create summary notes with project breakdown

## 📋 Invoice Statuses

| Status | Meaning | Actions Available |
|--------|---------|-------------------|
| **Draft** | Not yet sent to client | Edit, Mark as Sent, Delete |
| **Sent** | Sent to client | Edit, Mark as Paid, Delete |
| **Paid** | Payment received | Edit (limited), Delete |
| **Overdue** | Past due date, not paid | Mark as Paid, Edit, Delete |
| **Cancelled** | Cancelled invoice | Edit, Delete |

## 🔄 Common Workflows

### Send Invoice to Client
1. Create invoice (manual or auto-generate)
2. Review details in the invoice view
3. Click **Mark as Sent**
4. Status changes to "Sent"

### Record Payment
1. Open the invoice
2. Click **Mark as Paid**
3. System automatically sets:
   - Status → Paid
   - Paid Date → Today

### Edit Invoice
1. Open the invoice
2. Click **Edit**
3. Modify fields (amount, status, due date, paid date, notes)
4. Click **Save Changes** or **Cancel**

### Delete Invoice
1. From list view, click **Delete** next to invoice
2. OR from detail view, click **Delete** button
3. Confirm deletion

## 🔍 Filtering Invoices

In the invoice list view:
- **Filter by Client**: Select from dropdown
- **Filter by Status**: Select status from dropdown
- **Clear Filters**: Click "Clear Filters" button

## 💰 Summary Cards

The invoice list shows three summary cards:
- **Total Amount**: Sum of all invoices
- **Paid**: Sum of paid invoices (green)
- **Outstanding**: Sum of unpaid invoices (orange)

## ⚠️ Overdue Invoices

Invoices are automatically marked as overdue when:
- Status is NOT "Paid" or "Cancelled"
- Due date is in the past

Overdue invoices display:
- Red "Overdue" badge
- Red-tinted row in the table

## 🔢 Invoice Numbers

Invoice numbers follow the format: `INV-YYYYMMDD-XXX`

Example: `INV-20241101-042`
- `INV` = Prefix
- `20241101` = Date (Nov 1, 2024)
- `042` = Random 3-digit number

The system automatically generates unique numbers and retries if a collision occurs.

## 📊 Auto-Generation Details

When auto-generating from time entries:

### What Gets Included
- ✅ Billable time entries only
- ✅ For the selected client
- ✅ Optionally filtered by project
- ✅ Optionally filtered by date range

### What Gets Calculated
- Total minutes from matching entries
- Total hours (minutes ÷ 60)
- Invoice amount (hours × hourly rate)

### Auto-Generated Notes
System creates a summary like:
```
Website Redesign: 12.50 hours
Mobile App: 8.75 hours
```

You can add your own notes above this summary.

## 🛠️ Technical Details

### Currency Support
Currently supports:
- USD (default)
- EUR
- GBP

### Validation
- Invoice number must be unique
- Client must exist
- Project must belong to selected client (if specified)
- Amount must be positive
- Due date must be after issue date (recommended)

### Data Relationships
- Each invoice belongs to one client (required)
- Each invoice can belong to one project (optional)
- Deleting a client deletes all their invoices (cascade)
- Deleting a project sets invoice projectId to null

## 📁 Navigation

- **List View**: `/invoices`
- **Create New**: `/invoices/new`
- **View/Edit**: `/invoices/[id]`

## 🎨 Status Colors

- **Draft**: Gray badge
- **Sent**: Blue badge
- **Paid**: Green badge
- **Overdue**: Red badge
- **Cancelled**: Gray badge (lighter text)

## 💡 Tips

1. **Use auto-generation** when billing hourly to save time
2. **Keep notes updated** for clear communication with clients
3. **Mark as sent** immediately after sending to track status
4. **Use project filtering** to create project-specific invoices
5. **Check overdue invoices** regularly from the filtered view
6. **Set consistent due dates** (e.g., always 30 days) for predictable cash flow

---

## 🐛 Troubleshooting

**"Invoice number already exists"**
- Click "Generate" button again for a new number
- Or manually create a unique number

**"No billable time entries found"**
- Check that time entries are marked as billable
- Verify time entries exist for the selected project/client
- Adjust date range filters if using them

**"Project does not belong to client"**
- Selected project must belong to selected client
- Change client or project to match

**"Failed to fetch invoices"**
- Check server logs for database connection issues
- Ensure Prisma client is generated (`pnpm db:generate`)

---

Ready to manage your invoices efficiently! 🎉
