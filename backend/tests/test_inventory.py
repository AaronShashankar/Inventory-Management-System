from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from django.core.management import call_command
from django.db import close_old_connections, connection
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.accounts.models import Membership, Organization
from apps.api.errors import Conflict
from apps.catalog.models import Product
from apps.inventory.models import InventoryBalance, StockMovement
from apps.inventory.services import post_document, save_draft


def draft(s, kind, quantity, **extra):
    data = {
        "type": kind,
        "reason": "Test operation",
        "lines": [{"product": s["product"], "quantity": quantity}],
    }
    if kind in ("ISSUE", "TRANSFER"):
        data["source_location"] = s["a"]
    if kind in ("RECEIVE", "TRANSFER", "ADJUST"):
        data["destination_location"] = s["b"] if kind == "TRANSFER" else s["a"]
    data.update(extra)
    return save_draft(s["org"], s["user"], data)


def post(s, document, key=None):
    return post_document(s["org"], s["user"], document.pk, key or str(document.pk))


def quantity(s, location="a"):
    return InventoryBalance.objects.get(product=s["product"], location=s[location]).on_hand


def test_receipt_issue_transfer_and_reconcile(setup):
    s = setup
    receipt = draft(s, "RECEIVE", 20)
    assert not StockMovement.objects.exists()
    post(s, receipt)
    post(s, draft(s, "ISSUE", 5))
    post(s, draft(s, "TRANSFER", 4))
    assert quantity(s) == 11 and quantity(s, "b") == 4
    assert StockMovement.objects.count() == 4
    call_command("reconcile_inventory")


def test_duplicate_post_is_idempotent_and_key_conflicts(setup):
    s = setup
    receipt = draft(s, "RECEIVE", 20)
    post(s, receipt, "same-key")
    post(s, receipt, "same-key")
    post(s, receipt, "new-key")
    assert quantity(s) == 20 and StockMovement.objects.count() == 1
    other = draft(s, "RECEIVE", 3)
    with pytest.raises(Conflict):
        post(s, other, "same-key")
    assert quantity(s) == 20


def test_insufficient_stock_rolls_back_all_lines(setup):
    s = setup
    post(s, draft(s, "RECEIVE", 5))
    second = Product.objects.create(
        organization=s["org"], sku="SECOND", name="Second", unit=s["product"].unit
    )
    issue = draft(
        s,
        "ISSUE",
        1,
        lines=[{"product": s["product"], "quantity": 1}, {"product": second, "quantity": 1}],
    )
    with pytest.raises(Conflict):
        post(s, issue)
    issue.refresh_from_db()
    assert issue.status == "DRAFT" and quantity(s) == 5
    assert StockMovement.objects.count() == 1


@pytest.mark.parametrize("qty", [0, -1, 1.5, True])
def test_invalid_quantities(setup, qty):
    with pytest.raises(ValidationError):
        draft(setup, "RECEIVE", qty)


def test_transfer_same_location(setup):
    with pytest.raises(ValidationError):
        draft(setup, "TRANSFER", 1, destination_location=setup["a"])


def test_tenant_and_role_checks_at_service_boundary(setup):
    s = setup
    other = Organization.objects.create(name="Other", slug="other")
    product = Product.objects.create(
        organization=other, sku="FOREIGN", name="Foreign", unit=s["product"].unit
    )
    with pytest.raises(ValidationError):
        draft(s, "RECEIVE", 1, lines=[{"product": product, "quantity": 1}])
    Membership.objects.filter(user=s["user"]).update(role="VIEWER")
    with pytest.raises(PermissionDenied):
        draft(s, "RECEIVE", 1)


def test_staff_cannot_adjust_or_retype_adjustment(setup):
    s = setup
    doc = draft(
        s,
        "ADJUST",
        1,
        lines=[{"product": s["product"], "quantity": 1, "adjustment_direction": "IN"}],
    )
    Membership.objects.filter(user=s["user"]).update(role="STAFF")
    with pytest.raises(PermissionDenied):
        post(s, doc)
    with pytest.raises(PermissionDenied):
        save_draft(
            s["org"],
            s["user"],
            {
                "type": "RECEIVE",
                "destination_location": s["a"],
                "reason": "test",
                "lines": [{"product": s["product"], "quantity": 1}],
            },
            doc.pk,
        )


def test_posted_draft_immutable_and_inactive_product_revalidated(setup):
    s = setup
    doc = draft(s, "RECEIVE", 5)
    post(s, doc)
    with pytest.raises(Conflict):
        save_draft(s["org"], s["user"], {"type": "RECEIVE"}, doc.pk)
    issue = draft(s, "ISSUE", 1)
    Product.objects.filter(pk=s["product"].pk).update(is_active=False)
    with pytest.raises(ValidationError):
        post(s, issue)
    assert quantity(s) == 5


@pytest.mark.django_db(transaction=True)
def test_concurrent_issue_never_oversells(setup):
    assert connection.vendor == "postgresql", "Concurrency gate requires PostgreSQL"
    s = setup
    post(s, draft(s, "RECEIVE", 5))
    documents = [draft(s, "ISSUE", 4), draft(s, "ISSUE", 3)]
    barrier = Barrier(2)

    def worker(document):
        close_old_connections()
        try:
            barrier.wait(timeout=10)
            post(s, document)
            return "posted"
        except Conflict:
            return "conflict"
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(worker, documents))
    assert sorted(results) == ["conflict", "posted"]
    assert quantity(s) in (1, 2)
    assert StockMovement.objects.count() == 2
    call_command("reconcile_inventory")


def test_database_rejects_history_rewrites(setup):
    from django.db import DatabaseError, transaction

    s = setup
    document = draft(s, "RECEIVE", 3)
    post(s, document)
    movement = StockMovement.objects.get(document=document)
    with pytest.raises(DatabaseError), transaction.atomic():
        StockMovement.objects.filter(pk=movement.pk).update(delta_quantity=99)
    with pytest.raises(DatabaseError), transaction.atomic():
        document.lines.update(quantity=99)
    with pytest.raises(DatabaseError), transaction.atomic():
        from apps.inventory.models import StockDocument

        StockDocument.objects.filter(pk=document.pk).update(reason="rewrite")
    assert quantity(s) == 3
