#!/usr/bin/env python
"""
Run the FastAPI server with automatic database migration on startup.
This ensures the database schema is always up to date.
"""
import os
import sys
import subprocess

# Run database migration first
print("="*60)
print("Running database migration...")
print("="*60)

try:
    result = subprocess.run(
        [sys.executable, "fix_production_db.py"],
        capture_output=True,
        text=True,
        check=True
    )
    print(result.stdout)
    if result.stderr:
        print(result.stderr)
except subprocess.CalledProcessError as e:
    print(f"Migration failed: {e}")
    print(e.stdout)
    print(e.stderr)
    # Continue anyway - the app might still work
except FileNotFoundError:
    print("fix_production_db.py not found, skipping migration")

print("="*60)
print("Starting server...")
print("="*60)

# Run the server
os.execvp(sys.executable, [sys.executable, "run.py"])
