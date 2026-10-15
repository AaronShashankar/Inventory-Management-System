"""Purchasing state transitions and receipts; see docs/algorithms/purchasing.md."""

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.services import MANAGERS, OPERATORS, audit, authorize, lock_organization
from apps.api.errors import Conflict
from apps.inventory.services import _post_locked, claim_key, next_number, save_draft, tenant_object

from .models import GoodsReceipt, GoodsReceiptLine, PurchaseOrder, PurchaseOrderLine


def received_quantity(line):
    return (
        line.receipt_lines.filter(goods_receipt__stock_document__status="POSTED").aggregate(
            total=Sum("received_qty")
        )["total"]
        or 0
    )


@transaction.atomic
def save_order(organization, actor, data, order_id=None):
    lock_organization(organization)
    authorize(actor, organization, MANAGERS)
    order = tenant_object(PurchaseOrder, organization, order_id) if order_id else None
    if order and order.status != "DRAFT":
        raise Conflict("Only draft orders can be edited.")
    lines = data.pop("lines")
    if data["supplier"].organization_id != organization.pk or not data["supplier"].is_active:
        raise ValidationError("Supplier is inactive or outside this organization.")
    if not lines or len(lines) > 100 or len({x["product"].pk for x in lines}) != len(lines):
        raise ValidationError("Supply 1-100 unique product lines.")
    for line in lines:
        if (
            line["product"].organization_id != organization.pk
            or not line["product"].is_active
            or line["ordered_qty"] <= 0
            or line["unit_price"] < 0
        ):
            raise ValidationError("Invalid purchase order line.")
    if order:
        for key, value in data.items():
            setattr(order, key, value)
        order.save()
        order.lines.all().delete()
    else:
        order = PurchaseOrder.objects.create(
            organization=organization,
            created_by=actor,
            po_number=next_number(organization, "PO"),
            **data,
        )
    PurchaseOrderLine.objects.bulk_create(
        [PurchaseOrderLine(purchase_order=order, **line) for line in lines]
    )
    audit(organization, actor, "purchase.draft_saved", order)
    return order


@transaction.atomic
def transition_order(organization, actor, order_id, action):
    lock_organization(organization)
    authorize(actor, organization, MANAGERS)
    order = tenant_object(PurchaseOrder, organization, order_id)
    if action == "submit" and order.status == "DRAFT":
        if (
            not order.lines.exists()
            or not order.supplier.is_active
            or order.lines.filter(product__is_active=False).exists()
        ):
            raise ValidationError("An active supplier and active product lines are required.")
        order.status, order.submitted_at = "ORDERED", timezone.now()
    elif action == "cancel" and order.status in ("DRAFT", "ORDERED"):
        order.status, order.closed_at = "CANCELLED", timezone.now()
    elif action == "close" and order.status in ("ORDERED", "PARTIALLY_RECEIVED", "RECEIVED"):
        order.status, order.closed_at = "CLOSED", timezone.now()
    else:
        raise Conflict("This transition is not allowed from the current order state.")
    order.save()
    audit(organization, actor, f"purchase.{action}", order)
    return order


@transaction.atomic
def create_receipt(organization, actor, order_id, location, lines):
    lock_organization(organization)
    authorize(actor, organization, OPERATORS)
    order = tenant_object(PurchaseOrder, organization, order_id)
    if order.status not in ("ORDERED", "PARTIALLY_RECEIVED"):
        raise Conflict("This purchase order is not open for receiving.")
    if not lines or len({x["purchase_order_line"] for x in lines}) != len(lines):
        raise ValidationError("Supply unique receipt lines.")
    stock_lines, receipt_lines = [], []
    for item in lines:
        line = order.lines.filter(pk=item["purchase_order_line"]).first()
        if not line or not 0 < item["received_qty"] <= line.ordered_qty - received_quantity(line):
            raise Conflict("Receipt exceeds the outstanding order quantity.", "OVER_RECEIPT")
        stock_lines.append(
            {
                "product": line.product,
                "quantity": item["received_qty"],
                "unit_cost": line.unit_price,
            }
        )
        receipt_lines.append((line, item["received_qty"]))
    document = save_draft(
        organization,
        actor,
        {
            "type": "RECEIVE",
            "destination_location": location,
            "reason": f"Purchase receipt {order.po_number}",
            "reference": order.po_number,
            "lines": stock_lines,
        },
    )
    receipt = GoodsReceipt.objects.create(
        organization=organization,
        purchase_order=order,
        stock_document=document,
        receipt_number=next_number(organization, "GR"),
    )
    GoodsReceiptLine.objects.bulk_create(
        [
            GoodsReceiptLine(goods_receipt=receipt, purchase_order_line=line, received_qty=quantity)
            for line, quantity in receipt_lines
        ]
    )
    audit(organization, actor, "receipt.created", receipt)
    return receipt


@transaction.atomic
def post_receipt(organization, actor, receipt_id, key):
    lock_organization(organization)
    authorize(actor, organization, OPERATORS)
    receipt = tenant_object(GoodsReceipt, organization, receipt_id)
    record = claim_key(organization, actor, "receipt.post", key, {"receipt": receipt.pk})
    if record.response or receipt.stock_document.status == "POSTED":
        return receipt
    order = receipt.purchase_order
    if order.status not in ("ORDERED", "PARTIALLY_RECEIVED"):
        raise Conflict("The purchase order is closed for receiving.")
    for item in receipt.lines.select_related("purchase_order_line"):
        line = item.purchase_order_line
        if item.received_qty > line.ordered_qty - received_quantity(line):
            raise Conflict("Another receipt has consumed the remaining quantity.", "OVER_RECEIPT")
    _post_locked(receipt.stock_document, actor)
    order.status = (
        "RECEIVED"
        if all(received_quantity(line) == line.ordered_qty for line in order.lines.all())
        else "PARTIALLY_RECEIVED"
    )
    order.save(update_fields=["status", "updated_at"])
    audit(organization, actor, "receipt.posted", receipt)
    record.response = {"id": str(receipt.pk), "status": "POSTED"}
    record.save(update_fields=["response"])
    return receipt
