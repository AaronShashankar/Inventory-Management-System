from decimal import Decimal

import pytest

from apps.api.errors import Conflict
from apps.inventory.models import StockMovement
from apps.inventory.services import post_document
from apps.purchasing.services import (
    create_receipt,
    post_receipt,
    received_quantity,
    save_order,
    transition_order,
)


def order(s):
    result = save_order(
        s["org"],
        s["user"],
        {
            "supplier": s["supplier"],
            "lines": [
                {"product": s["product"], "ordered_qty": 100, "unit_price": Decimal("250.25")}
            ],
        },
    )
    transition_order(s["org"], s["user"], result.pk, "submit")
    return result


def receipt(s, po, qty):
    return create_receipt(
        s["org"],
        s["user"],
        po.pk,
        s["a"],
        [{"purchase_order_line": po.lines.get().pk, "received_qty": qty}],
    )


def test_partial_full_receipt_and_retry(setup):
    s = setup
    po = order(s)
    first = receipt(s, po, 40)
    post_receipt(s["org"], s["user"], first.pk, "one")
    po.refresh_from_db()
    assert po.status == "PARTIALLY_RECEIVED"
    second = receipt(s, po, 60)
    post_receipt(s["org"], s["user"], second.pk, "two")
    post_receipt(s["org"], s["user"], second.pk, "two")
    po.refresh_from_db()
    assert po.status == "RECEIVED"
    assert received_quantity(po.lines.get()) == 100
    assert StockMovement.objects.count() == 2


def test_over_receipt_rechecked_on_post_and_cannot_bypass(setup):
    s = setup
    po = order(s)
    first = receipt(s, po, 70)
    second = receipt(s, po, 40)
    with pytest.raises(Conflict):
        post_document(s["org"], s["user"], first.stock_document_id, "bypass")
    post_receipt(s["org"], s["user"], first.pk, "first")
    with pytest.raises(Conflict):
        post_receipt(s["org"], s["user"], second.pk, "second")
    assert received_quantity(po.lines.get()) == 70
    assert StockMovement.objects.count() == 1


def test_close_prevents_outstanding_draft_receipt(setup):
    s = setup
    po = order(s)
    r = receipt(s, po, 10)
    transition_order(s["org"], s["user"], po.pk, "close")
    with pytest.raises(Conflict):
        post_receipt(s["org"], s["user"], r.pk, "closed")
    assert not StockMovement.objects.exists()
