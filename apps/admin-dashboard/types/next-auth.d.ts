import NextAuth, { DefaultSession } from "next-auth";
import { JWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      clientId: number | null;
    } & DefaultSession["user"];
  }

  interface User {
    role?: string;
    clientId?: number | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    userId?: string;
    clientId?: number | null;
  }
}
