
import sqlite3
import os

DB_FILE = "cipherlink_v4.db"

def migrate():
    if not os.path.exists(DB_FILE):
        print(f"Database file {DB_FILE} not found. Skipping migration (will be created fresh).")
        return

    with sqlite3.connect(DB_FILE) as conn:
        cursor = conn.cursor()

        # Check that the users table exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
        )
        if cursor.fetchone() is None:
            print("Table 'users' does not exist. Skipping migration.")
            return

        # Get existing columns
        cursor.execute("PRAGMA table_info(users)")
        columns = [info[1] for info in cursor.fetchall()]

        new_columns = [
            ("is_disabled", "BOOLEAN DEFAULT 0"),
            ("disabled_at", "DATETIME"),
            ("deleted_at", "DATETIME"),
            ("last_username_change", "DATETIME"),
            ("previous_usernames", "JSON"),
        ]

        failures: list[str] = []
        for col_name, col_type in new_columns:
            if col_name not in columns:
                print(f"Adding column {col_name}...")
                try:
                    cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")
                    print(f"✅ Added {col_name}")
                except Exception as e:
                    failures.append(col_name)
                    print(f"❌ Failed to add {col_name}: {e}")
            else:
                print(f"Column {col_name} already exists.")

        if failures:
            conn.rollback()
            print(f"\nMigration rolled back — failed columns: {', '.join(failures)}")
        else:
            conn.commit()
            print("\nMigration complete — all columns applied successfully.")

if __name__ == "__main__":
    migrate()
