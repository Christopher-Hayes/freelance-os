import { signIn } from "@/lib/auth";
import { redirect } from "next/navigation";

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  async function handleSignIn(formData: FormData) {
    "use server";
    
    const email = formData.get("email") as string;
    const params = await searchParams;
    
    console.log("[SignIn] Attempting sign in for:", email);
    
    await signIn("email", {
      email,
      redirectTo: params.callbackUrl || "/dashboard",
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            Client Portal
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Sign in to access your projects and invoices
          </p>
        </div>
        
        <form className="mt-8 space-y-6" action={handleSignIn}>
          <div>
            <label htmlFor="email" className="sr-only">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
              placeholder="Email address"
            />
          </div>

          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Send magic link
            </button>
          </div>
          
          <p className="text-center text-xs text-gray-500 dark:text-gray-400">
            We'll send you a magic link to sign in without a password
          </p>
        </form>
      </div>
    </div>
  );
}
