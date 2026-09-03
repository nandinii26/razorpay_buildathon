import pytest
from app.models import Customer, Payment

def test_get_stats_empty(client):
    """Test stats endpoint when no data exists."""
    response = client.get("/api/stats")
    assert response.status_code == 200
    assert response.json()["total_customers"] == 0

def test_create_customer(client, db):
    """Test customer creation."""
    customer_data = {
        "name": "John Doe",
        "email": "john@example.com",
        "phone": "1234567890"
    }
    response = client.post("/api/customers", json=customer_data)
    assert response.status_code == 200
    assert response.json()["name"] == "John Doe"

def test_get_customers(client, db):
    """Test retrieving customers."""
    response = client.get("/api/customers")
    assert response.status_code == 200
    assert isinstance(response.json(), list)