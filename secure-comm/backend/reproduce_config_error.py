import os
# Set a "bad" environment variable that is NOT valid JSON
os.environ["ALLOWED_ORIGINS"] = "http://localhost:3000,http://example.com"

from app.core.config import Settings
from pydantic import ValidationError

try:
    print("Attempting to load settings with comma-separated string...")
    settings = Settings()
    print("Settings loaded successfully!")
    print(f"ALLOWED_ORIGINS: {settings.ALLOWED_ORIGINS}")
except Exception as e:
    print(f"Failed to load settings: {e}")
