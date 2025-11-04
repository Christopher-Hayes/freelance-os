interface Invoice {
  id: number;
  invoiceNumber: string;
  status: string;
  amount: number;
  issueDate: string;
  dueDate: string | null;
}

interface InvoicesSummaryProps {
  invoices: Invoice[];
}

export function InvoicesSummary({ invoices }: InvoicesSummaryProps) {
  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const getStatusBadge = (status: string, dueDate: string | null) => {
    const now = new Date();
    const isOverdue = dueDate && new Date(dueDate) < now && (status === "sent" || status === "SENT");

    if (isOverdue) {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
          Overdue
        </span>
      );
    }

    switch (status.toLowerCase()) {
      case "paid":
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            Paid
          </span>
        );
      case "sent":
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            Sent
          </span>
        );
      case "draft":
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400">
            Draft
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400">
            {status}
          </span>
        );
    }
  };

  if (invoices.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Recent Invoices
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">
          No invoices yet
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Recent Invoices
      </h2>
      <div className="space-y-3">
        {invoices.map((invoice) => (
          <div
            key={invoice.id}
            className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-gray-900 dark:text-white">
                  {invoice.invoiceNumber}
                </h3>
                {getStatusBadge(invoice.status, invoice.dueDate)}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Issued: {formatDate(invoice.issueDate)}
                {invoice.dueDate && ` • Due: ${formatDate(invoice.dueDate)}`}
              </p>
            </div>
            <div className="text-right ml-4">
              <p className="font-semibold text-gray-900 dark:text-white">
                {formatCurrency(invoice.amount)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
