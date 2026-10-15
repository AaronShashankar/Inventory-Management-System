import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Membership, Organization, User
from apps.catalog.models import Product, StorageLocation, Supplier, Unit, Warehouse


@pytest.fixture
def setup(db):
    org = Organization.objects.create(name="Test", slug="test")
    user = User.objects.create_user(
        username="admin", email="admin@example.com", password="Test-password-2026!"
    )
    Membership.objects.create(organization=org, user=user, role="ADMIN")
    unit = Unit.objects.create(organization=org, code="PCS", name="Pieces")
    product = Product.objects.create(
        organization=org, sku="SKU-1", name="Cable", unit=unit, reorder_level=5
    )
    source = Warehouse.objects.create(organization=org, code="A", name="A")
    destination = Warehouse.objects.create(organization=org, code="B", name="B")
    a = StorageLocation.objects.create(organization=org, warehouse=source, code="MAIN")
    b = StorageLocation.objects.create(organization=org, warehouse=destination, code="MAIN")
    supplier = Supplier.objects.create(organization=org, name="Supplier")
    return {"org": org, "user": user, "product": product, "a": a, "b": b, "supplier": supplier}


@pytest.fixture
def client(setup):
    client = APIClient()
    client.force_authenticate(setup["user"])
    return client
