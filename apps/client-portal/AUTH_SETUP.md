# Phase 7: Client Portal Authentication - Setup & Testing Guide

## ✅ Completed Tasks

1. **NextAuth.js Dependencies** - Installed next-auth@beta and @auth/prisma-adapter
2. **Database Schema** - Added User, Account, Session, and VerificationToken tables
3. **Auth Configuration** - Created `/lib/auth.ts` with Resend email provider
4. **API Routes** - Set up `/api/auth/[...nextauth]/route.ts`
5. **UI Pages** - Created signin, error, and verify-request pages
6. **Middleware** - Protected routes with authentication checks
7. **Dashboard** - Created placeholder dashboard page

## 🔐 Authentication Flow

The client portal uses **magic link authentication** via email:
1. User enters their email on `/auth/signin`
2. NextAuth sends a magic link via email (using Resend)
3. User clicks the link to authenticate
4. Session is created and stored in the database
5. User is redirected to `/dashboard`

## 📧 Email Provider Setup (Required for Testing)

### Option 1: Resend (Recommended for Production)

1. Sign up at https://resend.com
2. Get your API key
3. Add to `/apps/client-portal/.env.local`:
   ```bash
   AUTH_RESEND_KEY="re_xxxxxxxxxxxxxxxxxxxxx"
   EMAIL_FROM="noreply@yourdomain.com"
   ```

### Option 2: Development Testing (No Email Provider)

For testing without an email provider, you can:

1. **Check server logs** - The magic link will be logged to the console when running in development mode
2. **Manually create a session** - Use the database directly (see below)

## 🧪 Testing Without Email Provider

### Method 1: Console Logs (Development Only)

1. Start the client portal:
   ```bash
   cd apps/client-portal
   pnpm dev
   ```

2. Go to http://localhost:3001/auth/signin
3. Enter an email address
4. Check the terminal - NextAuth logs the magic link URL in development
5. Copy the URL and paste it into your browser

### Method 2: Create User Account Manually

To link an existing client to a user account:

```sql
-- Link client #3 (chris@hayes.software) to a new user
INSERT INTO users (id, email, name, email_verified, client_id)
VALUES (
  gen_random_uuid()::text,
  'chris@hayes.software',
  'Chris Hayes',
  NOW(),
  3
);

-- To test without magic link, you can manually create a session
-- (This is for testing only - in production, sessions are created by NextAuth)
INSERT INTO sessions (id, session_token, user_id, expires)
VALUES (
  gen_random_uuid()::text,
  'test-session-token-' || gen_random_uuid()::text,
  (SELECT id FROM users WHERE email = 'chris@hayes.software'),
  NOW() + INTERVAL '30 days'
);
```

## 📋 Environment Variables Checklist

Add these to `/apps/client-portal/.env.local`:

```bash
# Database (inherited from root .env)
DATABASE_URL="postgresql://chris:PASSWORD@localhost:5432/freelance_os"

# NextAuth
NEXTAUTH_SECRET="hdH2ykFenqR9RrYKLXeZ4Nmm2IbTKT4+p5q/YXJyj8U="
NEXTAUTH_URL="http://localhost:3001"

# Email Provider (Resend)
AUTH_RESEND_KEY="re_xxxxxxxxxxxxxxxxxxxxx"
EMAIL_FROM="noreply@yourdomain.com"
```

## 🔍 Testing Checklist

### Basic Authentication
- [ ] Visit http://localhost:3001 → redirects to `/auth/signin`
- [ ] Enter email → see "Check your email" page
- [ ] Check console logs for magic link (dev mode)
- [ ] Click magic link → signed in, redirected to `/dashboard`
- [ ] Dashboard shows user email and client ID
- [ ] Click "Sign out" → redirected to signin page

### Protected Routes
- [ ] Try accessing `/dashboard` without auth → redirected to signin
- [ ] After signin, can access `/dashboard`
- [ ] Middleware protects all routes except `/auth/*`

### Session Persistence
- [ ] Sign in successfully
- [ ] Close browser
- [ ] Open http://localhost:3001 → still signed in
- [ ] Session stored in database

### Error Handling
- [ ] Invalid magic link → error page
- [ ] Expired magic link → error page
- [ ] No client linked → warning message on dashboard

## 🗄️ Database Tables

The following tables were added for NextAuth:

- `users` - User accounts (includes clientId to link to clients table)
- `accounts` - OAuth provider accounts (for future OAuth support)
- `sessions` - Active user sessions
- `verification_tokens` - Magic link tokens

## 🔗 Linking Users to Clients

The `users` table has a `client_id` column that links to the `clients` table. This allows:

1. **One client → One user** - Each client can have one portal user
2. **User → Client data** - Session includes `clientId` for filtering data
3. **Secure access** - API routes can filter by `session.user.clientId`

To link a user to a client:
```sql
UPDATE users
SET client_id = 3  -- The client's ID from the clients table
WHERE email = 'chris@hayes.software';
```

## 🚀 Next Steps (Phase 8+)

With authentication complete, we can now:
- Build dashboard API routes (filtered by clientId)
- Create projects view (client's projects only)
- Create time tracking view (client's time entries only)
- Create invoices view (client's invoices only)

All future API routes must validate the session and filter by `clientId`:

```typescript
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  
  if (!session?.user?.clientId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  // Fetch data filtered by session.user.clientId
  const projects = await prisma.project.findMany({
    where: { clientId: session.user.clientId },
  });
  
  return NextResponse.json(projects);
}
```

## 📝 Notes

- **NextAuth v5 (Beta)** - Using the latest version with improved TypeScript support
- **Database Sessions** - Sessions stored in DB for persistence across server restarts
- **Server-Side Only** - NextAuth v5 handles everything server-side (no client SessionProvider)
- **Magic Links** - More secure than passwords, better UX for clients
- **TypeScript** - Custom session type includes `clientId` for easy access

## 🐛 Troubleshooting

### "Cannot find module '@/lib/auth'"
- Run `pnpm install` in the client-portal directory
- Check that tsconfig.json has `"@/*": ["./*"]` in paths

### "Property 'user' does not exist on type 'PrismaClient'"
- Run `pnpm db:generate` in packages/database
- Restart your TypeScript server in VS Code

### Magic link not working
- Check that NEXTAUTH_URL matches your dev server URL
- Verify NEXTAUTH_SECRET is set
- Check console logs for the actual magic link URL

### Session not persisting
- Check that sessions table exists in database
- Verify DATABASE_URL is correct
- Check browser cookies aren't being blocked
