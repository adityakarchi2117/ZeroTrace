# Clear Production Database

**WARNING: This will DELETE ALL DATA permanently!**

## When to Use

- Starting fresh with a clean database
- Fixing corrupted data
- After schema migrations that require data reset

## How to Clear Database

### Option 1: Manual (Recommended)

1. Go to Render Dashboard → Your Web Service → Shell
2. Run:
```bash
python clear_production_db.py
```

3. Type `DELETE ALL DATA` when prompted
4. Wait for confirmation

### Option 2: Local with Production Database URL

```bash
export DATABASE_URL="your-production-postgres-url"
python clear_production_db.py
```

## What Gets Deleted

All data from these tables:
- `users` - All user accounts
- `messages` - All chat messages
- `friend_requests` - All pending/accepted friend requests
- `trusted_contacts` - All contact relationships
- `blocked_users` - All blocked user records
- `devices` - All device registrations
- `vault_items` - All vault storage
- `call_logs` - All call history
- And all other tables

## After Clearing

1. The database schema remains intact
2. All auto-increment sequences are reset to 1
3. You can start registering new users immediately
4. No backup is created - data is permanently lost

## Troubleshooting

If you get foreign key constraint errors, the script automatically disables constraints during deletion. If it still fails:

```bash
# Connect directly to database
psql $DATABASE_URL

# Manual truncate
TRUNCATE TABLE users, messages, friend_requests, trusted_contacts, 
               blocked_users, devices, vault_items, call_logs, 
               contacts, refresh_tokens, qr_login_sessions, 
               one_time_prekeys, friend_request_rate_limits 
CASCADE;
```
