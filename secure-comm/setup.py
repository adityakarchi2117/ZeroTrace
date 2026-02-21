#!/usr/bin/env python3
"""
ZeroTrace Platform Setup Script
Automated setup for the complete ZeroTrace platform
"""

import os
import sys
import subprocess
import json
import secrets
from pathlib import Path

def run_command(cmd, cwd=None, check=True):
    """Run shell command with error handling"""
    print(f"🔧 Running: {cmd}")
    try:
        result = subprocess.run(
            cmd, 
            shell=True, 
            cwd=cwd, 
            check=check,
            capture_output=True,
            text=True
        )
        if result.stdout:
            print(result.stdout)
        return result
    except subprocess.CalledProcessError as e:
        print(f"❌ Error: {e}")
        if e.stderr:
            print(f"Error output: {e.stderr}")
        if check:
            sys.exit(1)
        return e

def check_requirements():
    """Check if required tools are installed"""
    print("🔍 Checking requirements...")
    
    requirements = {
        'python3': 'python3 --version',
        'node': 'node --version',
        'npm': 'npm --version',
        'git': 'git --version',
    }
    
    missing = []
    for tool, cmd in requirements.items():
        result = run_command(cmd, check=False)
        if result.returncode != 0:
            missing.append(tool)
        else:
            print(f"✅ {tool}: {result.stdout.strip()}")
    
    if missing:
        print(f"❌ Missing requirements: {', '.join(missing)}")
        print("Please install the missing tools and run setup again.")
        sys.exit(1)
    
    print("✅ All requirements satisfied!")

def setup_backend():
    """Setup Python backend"""
    print("\n🐍 Setting up Python backend...")
    
    backend_dir = Path("secure-comm/backend")
    
    # Create virtual environment
    if not (backend_dir / "venv").exists():
        run_command("python3 -m venv venv", cwd=backend_dir)
    
    # Activate venv and install dependencies
    if os.name == 'nt':  # Windows
        pip_cmd = "venv\\Scripts\\pip"
        python_cmd = "venv\\Scripts\\python"
    else:  # Unix/Linux/macOS
        pip_cmd = "venv/bin/pip"
        python_cmd = "venv/bin/python"
    
    run_command(f"{pip_cmd} install --upgrade pip", cwd=backend_dir)
    run_command(f"{pip_cmd} install -r requirements.txt", cwd=backend_dir)
    
    # Generate secret key
    secret_key = secrets.token_urlsafe(32)
    
    # Create .env file
    env_content = f"""# ZeroTrace Backend Configuration
DATABASE_URL=sqlite:///./secure_comm.db
SECRET_KEY={secret_key}
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
ENVIRONMENT=development
ALLOWED_ORIGINS=["http://localhost:3000", "http://127.0.0.1:3000"]
ALLOWED_HOSTS=["localhost", "127.0.0.1"]
"""
    
    with open(backend_dir / ".env", "w") as f:
        f.write(env_content)
    
    print("✅ Backend setup complete!")

def setup_web_client():
    """Setup Next.js web client"""
    print("\n🌐 Setting up web client...")
    
    web_dir = Path("secure-comm/web-client")
    
    # Install dependencies
    run_command("npm install", cwd=web_dir)
    
    # Create .env.local
    env_content = """# ZeroTrace Web Client Configuration
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
NEXT_PUBLIC_ENVIRONMENT=development
"""
    
    with open(web_dir / ".env.local", "w") as f:
        f.write(env_content)
    
    print("✅ Web client setup complete!")

def setup_mobile_app():
    """Setup React Native mobile app"""
    print("\n📱 Setting up mobile app...")
    
    mobile_dir = Path("secure-comm/mobile-app")
    
    if not mobile_dir.exists():
        print("⚠️  Mobile app directory not found, skipping...")
        return
    
    # Install dependencies
    run_command("npm install", cwd=mobile_dir)
    
    # Install iOS pods (if on macOS)
    if sys.platform == "darwin":
        ios_dir = mobile_dir / "ios"
        if ios_dir.exists():
            run_command("pod install", cwd=ios_dir)
    
    print("✅ Mobile app setup complete!")

def setup_database():
    """Initialize database"""
    print("\n🗄️  Setting up database...")
    
    backend_dir = Path("secure-comm/backend")
    
    if os.name == 'nt':  # Windows
        python_cmd = "venv\\Scripts\\python"
    else:  # Unix/Linux/macOS
        python_cmd = "venv/bin/python"
    
    # Run database initialization
    init_script = """
import sys
sys.path.append('.')
from app.db.database import engine, Base
Base.metadata.create_all(bind=engine)
print("✅ Database tables created!")
"""
    
    with open(backend_dir / "init_db.py", "w") as f:
        f.write(init_script)
    
    run_command(f"{python_cmd} init_db.py", cwd=backend_dir)
    
    # Clean up
    os.remove(backend_dir / "init_db.py")
    
    print("✅ Database setup complete!")

def create_run_scripts():
    """Create convenient run scripts"""
    print("\n📝 Creating run scripts...")
    
    # Backend run script
    backend_script = """#!/bin/bash
# ZeroTrace Backend Runner
cd secure-comm/backend
source venv/bin/activate 2>/dev/null || venv\\Scripts\\activate
echo "🚀 Starting ZeroTrace API server..."
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
"""
    
    with open("run-backend.sh", "w") as f:
        f.write(backend_script)
    
    # Web client run script
    web_script = """#!/bin/bash
# ZeroTrace Web Client Runner
cd secure-comm/web-client
echo "🌐 Starting ZeroTrace web client..."
npm run dev
"""
    
    with open("run-web.sh", "w") as f:
        f.write(web_script)
    
    # Mobile run script
    mobile_script = """#!/bin/bash
# ZeroTrace Mobile App Runner
cd secure-comm/mobile-app
echo "📱 Starting ZeroTrace mobile app..."
echo "Choose platform:"
echo "1) Android"
echo "2) iOS"
read -p "Enter choice (1-2): " choice

case $choice in
    1) npm run android ;;
    2) npm run ios ;;
    *) echo "Invalid choice" ;;
esac
"""
    
    with open("run-mobile.sh", "w") as f:
        f.write(mobile_script)
    
    # Make scripts executable
    if os.name != 'nt':
        os.chmod("run-backend.sh", 0o755)
        os.chmod("run-web.sh", 0o755)
        os.chmod("run-mobile.sh", 0o755)
    
    print("✅ Run scripts created!")

def create_docker_setup():
    """Create Docker configuration"""
    print("\n🐳 Creating Docker setup...")
    
    # Docker Compose
    docker_compose = """version: '3.8'

services:
  backend:
    build: ./secure-comm/backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://cipherlink:secure123@db:5432/cipherlink
      - ENVIRONMENT=production
    depends_on:
      - db
    volumes:
      - ./secure-comm/backend:/app
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000

  web:
    build: ./secure-comm/web-client
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:8000/api
      - NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
    depends_on:
      - backend
    volumes:
      - ./secure-comm/web-client:/app
      - /app/node_modules

  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=cipherlink
      - POSTGRES_USER=cipherlink
      - POSTGRES_PASSWORD=secure123
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
"""
    
    with open("docker-compose.yml", "w") as f:
        f.write(docker_compose)
    
    # Backend Dockerfile
    backend_dockerfile = """FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
"""
    
    backend_dir = Path("secure-comm/backend")
    with open(backend_dir / "Dockerfile", "w") as f:
        f.write(backend_dockerfile)
    
    # Web Dockerfile
    web_dockerfile = """FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
"""
    
    web_dir = Path("secure-comm/web-client")
    with open(web_dir / "Dockerfile", "w") as f:
        f.write(web_dockerfile)
    
    print("✅ Docker setup created!")

def print_completion_message():
    """Print setup completion message"""
    print("\n" + "="*60)
    print("🎉 ZeroTrace Platform Setup Complete!")
    print("="*60)
    print()
    print("🚀 Quick Start:")
    print("1. Start backend:    ./run-backend.sh")
    print("2. Start web client: ./run-web.sh")
    print("3. Start mobile app: ./run-mobile.sh")
    print()
    print("🐳 Docker (Alternative):")
    print("   docker-compose up")
    print()
    print("🌐 URLs:")
    print("   API:        http://localhost:8000")
    print("   Web App:    http://localhost:3000")
    print("   API Docs:   http://localhost:8000/docs")
    print()
    print("🔐 Features:")
    print("   ✅ End-to-end encryption")
    print("   ✅ Zero-knowledge server")
    print("   ✅ Perfect Forward Secrecy")
    print("   ✅ Real-time messaging")
    print("   ✅ Secure vault")
    print("   ✅ Multi-platform support")
    print()
    print("📚 Next Steps:")
    print("   1. Register a new account")
    print("   2. Add contacts")
    print("   3. Start encrypted messaging!")
    print()
    print("🛡️  Security Note:")
    print("   Your private keys are generated and stored locally.")
    print("   The server never sees your plaintext messages.")
    print("="*60)

def main():
    """Main setup function"""
    print("🔐 ZeroTrace Platform Setup")
    print("=" * 40)
    
    try:
        check_requirements()
        setup_backend()
        setup_web_client()
        setup_mobile_app()
        setup_database()
        create_run_scripts()
        create_docker_setup()
        print_completion_message()
        
    except KeyboardInterrupt:
        print("\n❌ Setup interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Setup failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()