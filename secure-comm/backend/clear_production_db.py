#!/usr/bin/env python
"""
Clear all data from production PostgreSQL database.
⚠️  WARNING: This is a DESTRUCTIVE operation! All data will be lost!
"""
import os
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

def clear_production_database():
    """Clear all data from all tables in the production database."""
    
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL not set")
        sys.exit(1)
    
    # Convert asyncpg URL to psycopg2 if needed
    if database_url.startswith("postgresql+asyncpg://"):
        database_url = database_url.replace("postgresql+asyncpg://", "postgresql://")
    elif database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    
    print("="*60)
    print("WARNING: DESTRUCTIVE OPERATION")
    print("="*60)
    print(f"\nDatabase: {database_url[:50]}...")
    print("\nThis will DELETE ALL DATA from the following tables:")
    
    # Tables to clear (in order to handle foreign key constraints)
    tables = [
        # Friend-related tables first (depend on users)
        "friend_request_rate_limits",
        "blocked_users",
        "trusted_contacts",
        "friend_requests",
        
        # Message-related
        "messages",
        "call_logs",
        
        # User-related
        "contacts",
        "vault_items",
        "refresh_tokens",
        "qr_login_sessions",
        "one_time_prekeys",
        "devices",
        
        # Core tables last
        "users",
    ]
    
    for table in tables:
        print(f"  - {table}")
    
    print("\n" + "="*60)
    
    # Safety confirmation
    confirm = input("\nTo proceed, type 'DELETE ALL DATA': ")
    if confirm != "DELETE ALL DATA":
        print("\n[CANCELLED] No data was deleted.")
        sys.exit(0)
    
    print("\nConnecting to database...")
    engine = create_engine(database_url)
    
    with engine.connect() as conn:
        # Disable foreign key checks temporarily (PostgreSQL uses session_replication_role)
        print("\nDisabling foreign key constraints...")
        conn.execute(text("SET session_replication_role = 'replica'"))
        
        # Clear each table
        print("\nClearing tables...")
        for table in tables:
            try:
                # Check if table exists
                result = conn.execute(text(f"""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = '{table}'
                    )
                """))
                exists = result.scalar()
                
                if exists:
                    # Get count before deletion
                    count_result = conn.execute(text(f"SELECT COUNT(*) FROM {table}"))
                    count = count_result.scalar()
                    
                    # Truncate table (faster than DELETE)
                    conn.execute(text(f"TRUNCATE TABLE {table} CASCADE"))
                    print(f"  [OK] {table}: Deleted {count} rows")
                else:
                    print(f"  [SKIP] {table}: Table does not exist")
                    
            except Exception as e:
                print(f"  ❌ {table}: Error - {e}")
        
        # Re-enable foreign key constraints
        conn.execute(text("SET session_replication_role = 'origin'"))
        
        # Reset sequences
        print("\nResetting sequences...")
        try:
            sequences = conn.execute(text("""
                SELECT sequencename 
                FROM pg_sequences 
                WHERE schemaname = 'public'
            """))
            
            for seq in sequences.fetchall():
                seq_name = seq[0]
                try:
                    conn.execute(text(f"ALTER SEQUENCE {seq_name} RESTART WITH 1"))
                    print(f"  [OK] Reset: {seq_name}")
                except Exception as e:
                    print(f"  [WARN] {seq_name}: {e}")
        except Exception as e:
            print(f"  [WARN] Could not reset sequences: {e}")
        
        conn.commit()
        
        print("\n" + "="*60)
        print("SUCCESS: Database cleared!")
        print("="*60)
        print("\nAll tables are now empty. You can start fresh.")

if __name__ == "__main__":
    clear_production_database()
