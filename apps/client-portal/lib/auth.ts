import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@freelance-os/database";
import { sendVerificationRequest } from "./jmap-provider";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    {
      id: "email",
      type: "email",
      from: process.env.JMAP_FROM || process.env.JMAP_USERNAME,
      maxAge: 24 * 60 * 60, // 24 hours
      sendVerificationRequest,
    },
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "database",
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
    verifyRequest: "/auth/verify-request",
  },
  callbacks: {
    async session({ session, user }) {
      // Add clientId to session for easy access in components and API routes
      if (session.user) {
        session.user.id = user.id;
        
        // Fetch the user's clientId from the database
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { clientId: true },
        });
        
        session.user.clientId = dbUser?.clientId ?? null;
      }
      return session;
    },
  },
});
