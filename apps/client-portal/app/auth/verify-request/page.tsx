export default function VerifyRequestPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            Check your email
          </h2>
          <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
            <p className="text-center text-sm text-green-800 dark:text-green-200">
              A sign in link has been sent to your email address.
            </p>
          </div>
          <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
            Click the link in the email to sign in to your account.
          </p>
        </div>
      </div>
    </div>
  );
}
