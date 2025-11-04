# Client Portal - Quick Test Guide

## 🚀 Start the Portal

```bash
cd apps/client-portal
pnpm dev
```

**Ports**:
- Admin Dashboard: http://localhost:3010
- Client Portal: http://localhost:3011

## ⚙️ Required Environment Variable

Make sure your `.env` file has:
```bash
NEXTAUTH_URL=http://localhost:3011
```

## ✅ Quick Test (No Email Setup Needed)

### Option 1: Console Log Method
1. Go to http://localhost:3011/auth/signin
2. Enter any email (e.g., `chris@hayes.software`)
3. Check terminal output for magic link
4. Copy URL and paste in browser
5. You're signed in!

### Option 2: Create Test User in Database
```sql
-- Connect to database
psql "postgresql://chris:B638vjM9LE3Ur1u8UgFGIV1NYE3BUuXC0yg0Sc1T@localhost:5432/freelance_os"

-- Create user linked to client #3
INSERT INTO users (id, email, name, email_verified, client_id)
VALUES (
  'test-user-001',
  'chris@hayes.software',
  'Chris Hayes',
  NOW(),
  3
);

-- Create a session for immediate login (testing only!)
INSERT INTO sessions (id, session_token, user_id, expires)
VALUES (
  'test-session-001',
  'dev-session-token-12345',
  'test-user-001',
  NOW() + INTERVAL '30 days'
);
```

Then manually add cookie:
- Name: `authjs.session-token`
- Value: `dev-session-token-12345`
- Domain: `localhost`

## 📧 Setup Real Email (Production)

1. Sign up at https://resend.com
2. Get API key
3. Create `.env.local`:
   ```bash
   AUTH_RESEND_KEY="re_xxxxxxxxxxxxx"
   EMAIL_FROM="noreply@yourdomain.com"
   NEXTAUTH_SECRET="hdH2ykFenqR9RrYKLXeZ4Nmm2IbTKT4+p5q/YXJyj8U="
   NEXTAUTH_URL="http://localhost:3011"
   DATABASE_URL="postgresql://chris:PASSWORD@localhost:5432/freelance_os"
   ```

## 🧪 Test Checklist

- [ ] Homepage redirects to `/auth/signin`
- [ ] Enter email → see verify request page
- [ ] Magic link appears in console (dev) or email (prod)
- [ ] Click link → signed in, shows dashboard
- [ ] Dashboard shows email and client ID
- [ ] Sign out → back to signin
- [ ] Try accessing `/dashboard` logged out → redirected to signin
- [ ] Session persists after browser restart

## 🔗 Existing Test Clients

From seed data:
- Client #3: chris@hayes.software (Me)
- Client #4: example@hayes.software (AmikoXR)
- Client #5: frontline@client.hayes.software (Frontline)

## 🐛 Common Issues

**"Cannot find module '@/lib/auth'"**
→ Run `pnpm install` in `apps/client-portal`

**Magic link not working**
→ Check console logs, copy the full URL

**"Property 'user' does not exist on Prisma"**
→ Run `cd packages/database && pnpm db:generate`
→ Restart TypeScript server in VS Code

**Session not persisting**
→ Check that `sessions` table exists in database
→ Clear browser cookies and try again

## 📚 Files to Reference

- Setup: `apps/client-portal/AUTH_SETUP.md`
- Summary: `PHASE_7_SUMMARY.md`
- Checklist: `CHECKLIST.md`
