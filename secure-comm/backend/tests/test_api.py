"""
Basic tests for CipherLink Backend
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_root_endpoint():
    """Test the root endpoint returns correct status"""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "CipherLink API"
    assert data["status"] == "running"
    assert "version" in data


def test_health_check():
    """Test health check endpoint"""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


def test_security_info():
    """Test security information endpoint"""
    response = client.get("/api/security-info")
    assert response.status_code == 200
    data = response.json()
    assert "encryption" in data
    assert "features" in data
    assert data["features"]["zero_knowledge"] is True
    assert data["features"]["forward_secrecy"] is True


def test_register_user():
    """Test user registration"""
    response = client.post(
        "/api/auth/register",
        json={
            "username": "testuser123",
            "email": "test@example.com",
            "password": "Test123!@#Strong",
            "device_id": "test-device-001",
            "device_type": "web"
        }
    )
    # May fail if user exists, but endpoint should be reachable
    assert response.status_code in [201, 400]


def test_docs_accessible():
    """Test that API documentation is accessible"""
    response = client.get("/docs")
    assert response.status_code == 200
    
    response = client.get("/redoc")
    assert response.status_code == 200


def test_openapi_schema():
    """Test OpenAPI schema is available"""
    response = client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()
    assert "info" in schema
    assert schema["info"]["title"] == "CipherLink API"
