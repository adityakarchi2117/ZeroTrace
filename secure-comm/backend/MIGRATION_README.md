# Database Migration for Production

## Problem
The production PostgreSQL database has an outdated `friend_requests` table schema that is missing columns required by the current application code:
- `sender_id`
- `sender_public_key_fingerprint`
- `receiver_id`
- `receiver_public_key_fingerprint`
- `encrypted_message`
- `expires_at`
- `request_nonce`

## Solution

### Option 1: Automatic (Recommended)
The Dockerfile has been updated to run migrations automatically on container startup:

```dockerfile
CMD ["sh", "-c", "python fix_production_db.py && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
```

Just redeploy your Render service and it will fix itself.

### Option 2: Manual Migration
If you need to run the migration manually:

1. SSH into your Render web service or run locally with production DATABASE_URL:
```bash
export DATABASE_URL="your-production-postgres-url"
python fix_production_db.py
```

2. The script will:
   - Check current schema
   - Add missing columns
   - Create indexes
   - Add foreign key constraints
   - Add unique constraint on request_nonce

### Option 3: Alembic Migration
If you prefer using Alembic:

```bash
export DATABASE_URL="your-production-postgres-url"
alembic upgrade head
```

## Verification
After migration, verify the schema:
```sql
\d friend_requests
```

Expected columns:
- id
- sender_id
- sender_public_key_fingerprint
- receiver_id
- receiver_public_key_fingerprint
- encrypted_message
- status
- created_at
- updated_at
- expires_at
- request_nonce

## Rollback
If you need to rollback, restore from a database backup or contact support.
