import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Membership, Organization
from apps.catalog.models import Product
from apps.reporting.views import safe_csv


def test_cross_tenant_relations_and_lists(setup, client):
    s = setup
    other = Organization.objects.create(name="Other", slug="other")
    foreign = Product.objects.create(
        organization=other, sku="OTHER", name="Other", unit=s["product"].unit
    )
    assert client.get(f"/api/v1/products/{foreign.pk}/").status_code == 404
    response = client.post(
        "/api/v1/stock-documents/",
        {
            "type": "RECEIVE",
            "destination_location": str(s["a"].pk),
            "reason": "test",
            "lines": [{"product": str(foreign.pk), "quantity": 1}],
        },
        format="json",
    )
    assert response.status_code == 400
    assert client.get("/api/v1/products/", HTTP_X_ORGANIZATION_ID=str(other.pk)).status_code == 403


def test_create_post_and_immutable_ledger(setup, client):
    s = setup
    response = client.post(
        "/api/v1/stock-documents/",
        {
            "type": "RECEIVE",
            "destination_location": str(s["a"].pk),
            "reason": "opening",
            "lines": [{"product": str(s["product"].pk), "quantity": 20}],
        },
        format="json",
    )
    assert response.status_code == 201, response.data
    url = f"/api/v1/stock-documents/{response.data['id']}/post/"
    assert client.post(url, {}, format="json").status_code == 400
    assert client.post(url, {}, format="json", HTTP_IDEMPOTENCY_KEY="one").status_code == 200
    assert client.post("/api/v1/inventory/balances/", {}, format="json").status_code == 405
    assert client.post("/api/v1/inventory/movements/", {}, format="json").status_code == 405
    assert client.get("/api/v1/reports/stock-on-hand/").data["results"][0]["on_hand"] == 20


def test_viewer_cannot_mutate_and_staff_report_limits(setup, client):
    Membership.objects.filter(user=setup["user"]).update(role="VIEWER")
    assert client.post("/api/v1/products/", {}, format="json").status_code == 403
    assert client.post("/api/v1/stock-documents/", {}, format="json").status_code == 403
    Membership.objects.filter(user=setup["user"]).update(role="STAFF")
    assert client.get("/api/v1/reports/stock-on-hand/export.csv").status_code == 403
    assert client.get("/api/v1/audit-events/").status_code == 403


def test_login_csrf_and_session(setup):
    client = APIClient(enforce_csrf_checks=True)
    payload = {"username": "admin", "password": "Test-password-2026!"}
    assert client.post("/api/v1/auth/login/", payload, format="json").status_code == 403
    client.get("/api/v1/auth/csrf/")
    token = client.cookies["csrftoken"].value
    assert (
        client.post(
            "/api/v1/auth/login/", payload, format="json", HTTP_X_CSRFTOKEN=token
        ).status_code
        == 200
    )
    assert client.get("/api/v1/auth/me/").status_code == 200
    assert client.post("/api/v1/auth/logout/", {}, format="json").status_code == 403


def test_zero_stock_report_and_last_admin(setup, client):
    result = client.get("/api/v1/reports/low-stock/").data
    assert result["results"][0]["on_hand"] == 0
    member = Membership.objects.get(user=setup["user"])
    assert (
        client.patch(f"/api/v1/members/{member.pk}/", {"role": "VIEWER"}, format="json").status_code
        == 403
    )


@pytest.mark.parametrize("value", ["=HYPERLINK(1)", "+SUM(1)", "-1+1", "@SUM(1)", "  =cmd"])
def test_csv_formula_injection(value):
    assert safe_csv(value).startswith("'")


def test_reset_token_is_single_use(setup):
    from django.contrib.auth.tokens import default_token_generator
    from django.utils.encoding import force_bytes
    from django.utils.http import urlsafe_base64_encode

    s = setup
    browser = APIClient(enforce_csrf_checks=True)
    browser.get("/api/v1/auth/csrf/")
    token = browser.cookies["csrftoken"].value
    payload = {
        "uid": urlsafe_base64_encode(force_bytes(s["user"].pk)),
        "token": default_token_generator.make_token(s["user"]),
        "password": "New-test-password-2030!",
    }
    response = browser.post(
        "/api/v1/auth/password-reset/confirm/", payload, format="json", HTTP_X_CSRFTOKEN=token
    )
    assert response.status_code == 200, response.data
    assert (
        browser.post(
            "/api/v1/auth/password-reset/confirm/", payload, format="json", HTTP_X_CSRFTOKEN=token
        ).status_code
        == 400
    )
    s["user"].refresh_from_db()
    assert s["user"].check_password(payload["password"])


def test_invalid_tenant_header_and_duplicate_sku(setup, client):
    assert client.get("/api/v1/products/", HTTP_X_ORGANIZATION_ID="invalid").status_code == 403
    response = client.post(
        "/api/v1/products/",
        {"sku": "SKU-1", "name": "Duplicate", "unit": str(setup["product"].unit_id)},
        format="json",
    )
    assert response.status_code == 409


def test_invitation_creates_unusable_password_and_membership(client):
    from apps.accounts.models import User

    response = client.post(
        "/api/v1/members/invite/", {"email": "invite@example.com", "role": "STAFF"}, format="json"
    )
    assert response.status_code == 201, response.data
    user = User.objects.get(email="invite@example.com")
    assert not user.has_usable_password()
    assert Membership.objects.get(user=user).role == "STAFF"


def test_currency_change_cannot_reinterpret_existing_prices(client):
    assert (
        client.patch("/api/v1/organization/", {"base_currency": "USD"}, format="json").status_code
        == 409
    )
    response = client.patch(
        "/api/v1/organization/", {"name": "Renamed warehouse business"}, format="json"
    )
    assert response.status_code == 200
    assert response.data["base_currency"] == "NPR"
