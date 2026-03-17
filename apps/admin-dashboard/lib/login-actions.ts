"use server";

import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";

export async function authenticateCredentials(
  _prevState: string | null,
  formData: FormData
): Promise<string | null> {
  try {
    await signIn("credentials", {
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      redirectTo: (formData.get("callbackUrl") as string) || "/",
    });
    // signIn will throw NEXT_REDIRECT on success – never reaches here
    return null;
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return "Invalid email or password.";
        case "AccessDenied":
          return "Access denied. Only admin users can sign in here.";
        default:
          return "An authentication error occurred.";
      }
    }
    // Re-throw NEXT_REDIRECT (it's not an AuthError)
    throw error;
  }
}

export async function authenticateEmail(
  _prevState: string | null,
  formData: FormData
): Promise<string | null> {
  try {
    await signIn("email", {
      email: formData.get("email") as string,
      redirectTo: (formData.get("callbackUrl") as string) || "/",
      redirect: false,
    });
    return "__EMAIL_SENT__";
  } catch (error) {
    if (error instanceof AuthError) {
      return "Failed to send magic link. Please try again.";
    }
    // For email, redirect: false should not throw NEXT_REDIRECT
    // but if it does, let it through
    throw error;
  }
}
