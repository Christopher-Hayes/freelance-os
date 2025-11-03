# Freelance-OS Setup Guide

Complete setup instructions for getting your freelance-os monorepo up and running.

## Quick Start Checklist

- [ ] Install prerequisites (Node.js 20+, pnpm, PostgreSQL)
- [ ] Clone and install dependencies
- [ ] Set up PostgreSQL database
- [ ] Configure environment variables
- [ ] Initialize database schema
- [ ] Start development servers
- [ ] Configure activity tracking utility

## Detailed Setup

### 1. Prerequisites

#### Install Node.js (>= 20)

```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20

# Or download from: https://nodejs.org/
```

#### Install pnpm

```bash
npm install -g pnpm@10.19.0

# Or using curl
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

#### Install PostgreSQL 15+

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**Fedora/RHEL:**
```bash
sudo dnf install postgresql-server postgresql-contrib
sudo postgresql-setup --initdb
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**Arch Linux:**
```bash
sudo pacman -S postgresql
sudo -u postgres initdb -D /var/lib/postgres/data
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**macOS:**
```bash
brew install postgresql@15
brew services start postgresql@15
```

### 2. Clone Repository and Install Dependencies

```bash
# Navigate to your projects directory
cd ~/src/codeberg

# Clone the repository (if using git)
# Or navigate to the existing directory
cd freelance-os

# Install all dependencies
pnpm install
```

### 3. PostgreSQL Database Setup

#### Create Database and User

```bash
# Switch to postgres user
sudo -u postgres psql
```

In the PostgreSQL prompt:

```sql
-- Create dedicated user
CREATE USER freelance_user WITH PASSWORD 'your_secure_password_here';

-- Create database
CREATE DATABASE freelance_os OWNER freelance_user;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE freelance_os TO freelance_user;

-- Connect to database
\c freelance_os

-- Grant schema privileges (PostgreSQL 15+)
GRANT ALL ON SCHEMA public TO freelance_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO freelance_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO freelance_user;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO freelance_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO freelance_user;

-- Exit
\q
```

#### Test Database Connection

```bash
psql "postgresql://freelance_user:your_secure_password_here@localhost:5432/freelance_os"
```

You should see:
```
psql (15.x)
Type "help" for help.

freelance_os=>
```

Type `\q` to exit.

### 4. Configure Environment Variables

#### Root Directory

Create `.env` in the root of the monorepo:

```bash
cd ~/src/codeberg/freelance-os
cp .env.example .env
```

Edit `.env` and set:

```bash
# Database
DATABASE_URL="postgresql://freelance_user:your_secure_password_here@localhost:5432/freelance_os"

# Generate secrets with: openssl rand -base64 32
NEXTAUTH_SECRET="generate_this_with_openssl_command_above"
NEXTAUTH_URL="http://localhost:3001"

ADMIN_SECRET="generate_this_with_openssl_command_above"
```

#### Generate Secure Secrets

```bash
# Generate NEXTAUTH_SECRET
openssl rand -base64 32

# Generate ADMIN_SECRET
openssl rand -base64 32
```

Copy these into your `.env` file.

### 5. Initialize Database Schema

```bash
# Navigate to database package
cd packages/database

# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Push schema to database (creates tables)
pnpm db:push

# Optional: Seed with sample data
pnpm db:seed
```

#### Verify Tables Were Created

```bash
psql "postgresql://freelance_user:your_password@localhost:5432/freelance_os"
```

```sql
-- List all tables
\dt

-- You should see:
-- activity_sessions
-- activity_summaries
-- clients
-- projects
-- time_entries
-- invoices

-- Check a table
\d activity_sessions

-- Exit
\q
```

### 6. Start Development Servers

From the root directory:

```bash
# Start all apps
pnpm dev

# Or start individually:
pnpm dev --filter @freelance-os/admin-dashboard
pnpm dev --filter @freelance-os/client-portal
```

Access the applications:

- **Admin Dashboard**: http://localhost:3000
- **Client Portal**: http://localhost:3001

### 7. Configure Activity Tracking Utility

Update your existing activity tracking utility to use the same database:

```bash
# In your active-window utility directory
./active-window -track -submit -postgres "postgresql://freelance_user:your_password@localhost:5432/freelance_os"
```

Or update the `.env` file in your utility:

```bash
POSTGRES_CONNECTION_STRING=postgresql://freelance_user:your_password@localhost:5432/freelance_os
```

## Verification Checklist

After setup, verify everything is working:

- [ ] PostgreSQL service is running: `sudo systemctl status postgresql`
- [ ] Database connection works: `psql "postgresql://..."`
- [ ] Tables exist: `\dt` in psql shows all tables
- [ ] Prisma client generated: `packages/database/node_modules/.prisma/client` exists
- [ ] Admin dashboard loads: http://localhost:3000
- [ ] Client portal loads: http://localhost:3001
- [ ] Activity utility connects: Check for new entries in `activity_sessions` table

## Common Issues and Solutions

### Issue: Cannot connect to PostgreSQL

**Error**: `connection refused` or `could not connect to server`

**Solution**:
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Start it if not running
sudo systemctl start postgresql

# Enable auto-start on boot
sudo systemctl enable postgresql
```

### Issue: Authentication failed for user

**Error**: `FATAL: password authentication failed`

**Solution**:
```bash
# Reset password
sudo -u postgres psql -c "ALTER USER freelance_user WITH PASSWORD 'new_password';"

# Update your .env file with the new password
```

### Issue: Permission denied on table

**Error**: `permission denied for table activity_sessions`

**Solution**:
```bash
sudo -u postgres psql freelance_os

# Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO freelance_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO freelance_user;
\q
```

### Issue: Prisma client not found

**Error**: `Cannot find module '@prisma/client'`

**Solution**:
```bash
cd packages/database
pnpm install
pnpm db:generate
cd ../..
pnpm install
```

### Issue: Database tables not created

**Error**: Tables don't exist after `pnpm db:push`

**Solution**:
```bash
cd packages/database

# Try using migrate instead
pnpm db:migrate

# If that fails, manually check schema:
pnpm prisma db push --force-reset --skip-generate
pnpm db:generate
```

## Database Management

### Open Prisma Studio (Database GUI)

```bash
cd packages/database
pnpm db:studio
```

Opens at: http://localhost:5555

### Backup Database

```bash
# Full backup
pg_dump -U freelance_user -d freelance_os > backup_$(date +%Y%m%d).sql

# Compressed backup
pg_dump -U freelance_user -d freelance_os | gzip > backup_$(date +%Y%m%d).sql.gz
```

### Restore Database

```bash
# From backup
psql -U freelance_user -d freelance_os < backup_20251031.sql

# From compressed
gunzip -c backup_20251031.sql.gz | psql -U freelance_user -d freelance_os
```

### Reset Database (Development Only!)

```bash
cd packages/database

# ⚠️ WARNING: This deletes all data!
pnpm prisma db push --force-reset

# Regenerate client
pnpm db:generate

# Re-seed with sample data
pnpm db:seed
```

## Next Steps

1. ✅ Complete setup checklist above
2. 📖 Read `packages/database/README.md` for database details
3. 📖 Read `apps/admin-dashboard/README.md` for admin features
4. 📖 Read `apps/client-portal/README.md` for client portal features
5. 🔧 Start building your features!

## Development Workflow

```bash
# 1. Create new database models
cd packages/database
# Edit prisma/schema.prisma

# 2. Generate migration
pnpm db:migrate

# 3. Update TypeScript types
cd ../types
# Edit src/index.ts

# 4. Build features in apps
cd ../../apps/admin-dashboard
# or
cd ../../apps/client-portal

# 5. Test changes
pnpm dev
```

## Getting Help

- Check the root README.md for architecture overview
- Review package-specific READMEs for details
- Inspect the Prisma schema: `packages/database/prisma/schema.prisma`
- Use Prisma Studio to explore data: `pnpm db:studio`

---

Happy coding! 🚀
