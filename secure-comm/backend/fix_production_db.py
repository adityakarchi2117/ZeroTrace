"""
Fix production PostgreSQL database schema for friend_requests table.
Run this on Render or any PostgreSQL deployment.
"""
import os
import sys
import secrets
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker

def fix_friend_requests_schema():
    """Fix the friend_requests table schema."""
    
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL not set")
        sys.exit(1)
    
    # Convert asyncpg URL to psycopg2 if needed
    if database_url.startswith("postgresql+asyncpg://"):
        database_url = database_url.replace("postgresql+asyncpg://", "postgresql://")
    elif database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    
    print(f"Connecting to database...")
    engine = create_engine(database_url)
    
    with engine.connect() as conn:
        # First check if friend_requests table exists
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        
        if 'friend_requests' not in tables:
            print("friend_requests table does not exist. Creating it...")
            conn.execute(text("""
                CREATE TABLE friend_requests (
                    id SERIAL PRIMARY KEY,
                    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    sender_public_key_fingerprint VARCHAR(64) NOT NULL DEFAULT '',
                    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    receiver_public_key_fingerprint VARCHAR(64),
                    encrypted_message TEXT,
                    status VARCHAR(20) NOT NULL DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP,
                    expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
                    request_nonce VARCHAR(64) NOT NULL DEFAULT ''
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_friend_requests_sender_id ON friend_requests(sender_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_friend_requests_receiver_id ON friend_requests(receiver_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_friend_requests_status ON friend_requests(status)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_friend_request_sender_receiver ON friend_requests(sender_id, receiver_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_friend_request_pending ON friend_requests(receiver_id, status)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_friend_request_expires ON friend_requests(expires_at, status)"))
            conn.commit()
            print("✅ Created friend_requests table with correct schema")
            return
        
        # Check current schema
        columns = {col['name']: col for col in inspector.get_columns('friend_requests')}
        
        print(f"Current columns: {list(columns.keys())}")
        
        # Check if schema is completely incompatible (no sender_id AND no from_user_id)
        # This means the table was created with a very different schema
        essential_columns = {'sender_id', 'from_user_id', 'receiver_id', 'to_user_id'}
        has_any_essential = any(col in columns for col in essential_columns)
        
        if not has_any_essential and len(columns) > 1:
            print("⚠️ Table exists with incompatible schema. Dropping and recreating...")
            # First, drop old data (this is a clean slate approach)
            conn.execute(text("DROP TABLE friend_requests CASCADE"))
            conn.execute(text("""
                CREATE TABLE friend_requests (
                    id SERIAL PRIMARY KEY,
                    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    sender_public_key_fingerprint VARCHAR(64) NOT NULL DEFAULT '',
                    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    receiver_public_key_fingerprint VARCHAR(64),
                    encrypted_message TEXT,
                    status VARCHAR(20) NOT NULL DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP,
                    expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
                    request_nonce VARCHAR(64) NOT NULL DEFAULT ''
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_friend_requests_sender_id ON friend_requests(sender_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_friend_requests_receiver_id ON friend_requests(receiver_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_friend_requests_status ON friend_requests(status)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_friend_request_sender_receiver ON friend_requests(sender_id, receiver_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_friend_request_pending ON friend_requests(receiver_id, status)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_friend_request_expires ON friend_requests(expires_at, status)"))
            conn.commit()
            print("✅ Recreated friend_requests table with correct schema")
            return
        
        # Check for old column names that need to be migrated
        has_old_schema = 'from_user_id' in columns or 'to_user_id' in columns
        
        # Add missing columns
        migrations = []
        
        if 'sender_id' not in columns:
            if 'from_user_id' in columns:
                # Rename old column
                migrations.append("ADD COLUMN sender_id INTEGER")
                print("-> Will add: sender_id (will migrate from from_user_id)")
            else:
                migrations.append("ADD COLUMN sender_id INTEGER NOT NULL DEFAULT 1")
                print("-> Will add: sender_id")
        
        if 'sender_public_key_fingerprint' not in columns:
            migrations.append("ADD COLUMN sender_public_key_fingerprint VARCHAR(64) NOT NULL DEFAULT ''")
            print("-> Will add: sender_public_key_fingerprint")
        
        if 'receiver_id' not in columns:
            if 'to_user_id' in columns:
                # Rename old column
                migrations.append("ADD COLUMN receiver_id INTEGER")
                print("-> Will add: receiver_id (will migrate from to_user_id)")
            else:
                migrations.append("ADD COLUMN receiver_id INTEGER NOT NULL DEFAULT 1")
                print("-> Will add: receiver_id")
        
        if 'receiver_public_key_fingerprint' not in columns:
            migrations.append("ADD COLUMN receiver_public_key_fingerprint VARCHAR(64)")
            print("-> Will add: receiver_public_key_fingerprint")
        
        if 'encrypted_message' not in columns:
            migrations.append("ADD COLUMN encrypted_message TEXT")
            print("-> Will add: encrypted_message")
        
        if 'expires_at' not in columns:
            migrations.append("ADD COLUMN expires_at TIMESTAMP NOT NULL DEFAULT NOW()")
            print("-> Will add: expires_at")
        
        if 'request_nonce' not in columns:
            migrations.append("ADD COLUMN request_nonce VARCHAR(64) NOT NULL DEFAULT ''")
            print("-> Will add: request_nonce")
        
        # Execute migrations
        if migrations:
            print(f"\nExecuting {len(migrations)} migrations...")
            for migration in migrations:
                sql = f"ALTER TABLE friend_requests {migration}"
                print(f"  {sql}")
                conn.execute(text(sql))
            
            # Create indexes
            print("\nCreating indexes...")
            indexes = [
                "CREATE INDEX IF NOT EXISTS ix_friend_requests_sender_id ON friend_requests(sender_id)",
                "CREATE INDEX IF NOT EXISTS ix_friend_requests_receiver_id ON friend_requests(receiver_id)",
                "CREATE INDEX IF NOT EXISTS ix_friend_requests_expires_at ON friend_requests(expires_at)",
                "CREATE INDEX IF NOT EXISTS ix_friend_request_sender_receiver ON friend_requests(sender_id, receiver_id)",
                "CREATE INDEX IF NOT EXISTS ix_friend_request_pending ON friend_requests(receiver_id, status)",
                "CREATE INDEX IF NOT EXISTS ix_friend_request_expires ON friend_requests(expires_at, status)",
            ]
            
            for idx_sql in indexes:
                try:
                    conn.execute(text(idx_sql))
                    print(f"  Created: {idx_sql}")
                except Exception as e:
                    print(f"  Index may already exist: {e}")
            
            # Add foreign keys
            print("\nAdding foreign keys...")
            try:
                conn.execute(text("""
                    ALTER TABLE friend_requests 
                    ADD CONSTRAINT fk_friend_requests_sender 
                    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
                """))
                print("  Added FK: sender_id -> users.id")
            except Exception as e:
                print(f"  FK may already exist: {e}")
            
            try:
                conn.execute(text("""
                    ALTER TABLE friend_requests 
                    ADD CONSTRAINT fk_friend_requests_receiver 
                    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
                """))
                print("  Added FK: receiver_id -> users.id")
            except Exception as e:
                print(f"  FK may already exist: {e}")
            
            # Add unique constraint on request_nonce
            try:
                conn.execute(text("""
                    ALTER TABLE friend_requests 
                    ADD CONSTRAINT uq_friend_requests_nonce 
                    UNIQUE (request_nonce)
                """))
                print("  Added unique constraint: request_nonce")
            except Exception as e:
                print(f"  Unique constraint may already exist: {e}")
            
            # Migrate data from old columns if they exist
            if has_old_schema:
                print("\nMigrating data from old columns...")
                try:
                    conn.execute(text("""
                        UPDATE friend_requests 
                        SET sender_id = from_user_id,
                            receiver_id = to_user_id
                        WHERE from_user_id IS NOT NULL AND to_user_id IS NOT NULL
                    """))
                    print("  Migrated: from_user_id -> sender_id, to_user_id -> receiver_id")
                except Exception as e:
                    print(f"  Warning during data migration: {e}")
            
            # Generate nonces for existing rows
            print("\nGenerating request_nonces for existing rows...")
            try:
                result = conn.execute(text("SELECT id FROM friend_requests WHERE request_nonce = '' OR request_nonce IS NULL"))
                rows = result.fetchall()
                for row in rows:
                    nonce = secrets.token_hex(32)
                    conn.execute(
                        text("UPDATE friend_requests SET request_nonce = :nonce WHERE id = :id"),
                        {"nonce": nonce, "id": row[0]}
                    )
                print(f"  Generated nonces for {len(rows)} rows")
            except Exception as e:
                print(f"  Warning during nonce generation: {e}")
            
            conn.commit()
            print("\n✅ Database migration completed successfully!")
        else:
            print("\n✅ All columns already exist. No migration needed.")
        
        # Verify final schema
        inspector = inspect(engine)  # Refresh inspector
        columns = {col['name']: col for col in inspector.get_columns('friend_requests')}
        print(f"\nFinal columns: {list(columns.keys())}")
        
        # Verify all required columns exist
        required_columns = ['id', 'sender_id', 'receiver_id', 'status', 'created_at', 'expires_at', 'request_nonce']
        missing = [col for col in required_columns if col not in columns]
        if missing:
            print(f"⚠️ WARNING: Still missing columns: {missing}")
        else:
            print("✅ All required columns verified!")

if __name__ == "__main__":
    try:
        fix_friend_requests_schema()
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
