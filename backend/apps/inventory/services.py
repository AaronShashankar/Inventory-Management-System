"""The only stock write path. See docs/algorithms/stock-posting.md."""

import hashlib
import json

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from apps.accounts.services import MANAGERS, OPERATORS, audit, authorize, lock_organization
from apps.api.errors import Conflict

from .models import (
    DocumentSequence,
    IdempotencyRecord,
    InventoryBalance,
    StockDocument,
    StockDocumentLine,
    StockMovement,
)


def next_number(organization, prefix):
    sequence, _ = DocumentSequence.objects.get_or_create(organization=organization, prefix=prefix)
    sequence.value += 1
    sequence.save(update_fields=["value"])
    return f"{prefix}-{sequence.value:06d}"


def tenant_object(model, organization, pk):
    try:
        return model.objects.get(pk=pk, organization=organization)
    except (model.DoesNotExist, ValueError, TypeError, DjangoValidationError):
        raise NotFound("Related record not found in this organization.") from None


def validate_document(organization, data, lines):
    kind = data["type"]
    if kind not in StockDocument.Type.values:
        raise ValidationError({"type": "Unknown operation."})
    source, destination = data.get("source_location"), data.get("destination_location")
    if kind in ("ISSUE", "TRANSFER") and not source:
        raise ValidationError({"source_location": "A source bin is required."})
    if kind in ("RECEIVE", "TRANSFER", "ADJUST") and not destination:
        raise ValidationError({"destination_location": "A destination bin is required."})
    if (kind in ("RECEIVE", "ADJUST") and source) or (kind == "ISSUE" and destination):
        raise ValidationError("This operation has an unexpected location.")
    if kind == "TRANSFER" and source == destination:
        raise ValidationError("Transfer bins must differ.")
    for location in (source, destination):
        if location and (
            location.organization_id != organization.pk
            or not location.is_active
            or not location.warehouse.is_active
        ):
            raise ValidationError("Location is inactive or outside this organization.")
    if not data.get("reason", "").strip():
        raise ValidationError({"reason": "An operational reason is required."})
    if not lines or len(lines) > 100:
        raise ValidationError({"lines": "Supply between 1 and 100 lines."})
    seen = set()
    for line in lines:
        product = line["product"]
        if product.organization_id != organization.pk or not product.is_active:
            raise ValidationError("Product is inactive or outside this organization.")
        if product.pk in seen:
            raise ValidationError("Combine duplicate products into one line.")
        seen.add(product.pk)
        if (
            not isinstance(line["quantity"], int)
            or isinstance(line["quantity"], bool)
            or not 0 < line["quantity"] <= 2147483647
        ):
            raise ValidationError("Quantities must be positive whole numbers.")
        if kind == "ADJUST" and line.get("adjustment_direction") not in ("IN", "OUT"):
            raise ValidationError("Adjustment direction must be IN or OUT.")
        if kind != "ADJUST" and line.get("adjustment_direction"):
            raise ValidationError("Direction is only valid for adjustments.")
        if line.get("unit_cost") is not None and line["unit_cost"] < 0:
            raise ValidationError("Cost must not be negative.")


@transaction.atomic
def save_draft(organization, actor, data, document_id=None):
    lock_organization(organization)
    authorize(actor, organization, MANAGERS if data.get("type") == "ADJUST" else OPERATORS)
    document = tenant_object(StockDocument, organization, document_id) if document_id else None
    if document and (document.status != "DRAFT" or hasattr(document, "goodsreceipt")):
        raise Conflict("Only standalone drafts can be edited.")
    if document:
        authorize(actor, organization, MANAGERS if document.type == "ADJUST" else OPERATORS)
    lines = data.pop("lines")
    validate_document(organization, data, lines)
    if document:
        for key, value in data.items():
            setattr(document, key, value)
        document.save()
        document.lines.all().delete()
    else:
        document = StockDocument.objects.create(
            organization=organization,
            created_by=actor,
            document_no=next_number(organization, "STK"),
            **data,
        )
    StockDocumentLine.objects.bulk_create(
        [StockDocumentLine(document=document, **line) for line in lines]
    )
    audit(organization, actor, "stock.draft_saved", document)
    return document


def claim_key(organization, actor, endpoint, key, payload):
    if not key or len(key) > 128:
        raise ValidationError({"Idempotency-Key": "Supply a key of 1-128 characters."})
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()
    record, created = IdempotencyRecord.objects.get_or_create(
        organization=organization,
        actor=actor,
        endpoint=endpoint,
        key=key,
        defaults={"request_hash": digest},
    )
    if not created and record.request_hash != digest:
        raise Conflict("This idempotency key belongs to another request.", "IDEMPOTENCY_CONFLICT")
    return record


def _post_locked(document, actor):
    """Caller holds organization lock and transaction; never call from views directly."""
    if document.status == "POSTED":
        return document
    if document.status != "DRAFT":
        raise Conflict("Voided documents cannot be posted.")
    lines = list(document.lines.select_related("product"))
    validate_document(
        document.organization,
        {
            "type": document.type,
            "source_location": document.source_location,
            "destination_location": document.destination_location,
            "reason": document.reason,
        },
        [
            {
                "product": x.product,
                "quantity": x.quantity,
                "unit_cost": x.unit_cost,
                "adjustment_direction": x.adjustment_direction,
            }
            for x in lines
        ],
    )
    changes = []
    for line in lines:
        if document.type in ("ISSUE", "TRANSFER"):
            changes.append((line, document.source_location, -line.quantity))
        if document.type in ("RECEIVE", "TRANSFER", "ADJUST"):
            changes.append(
                (
                    line,
                    document.destination_location,
                    -line.quantity
                    if document.type == "ADJUST" and line.adjustment_direction == "OUT"
                    else line.quantity,
                )
            )
    for line, location, delta in sorted(
        changes, key=lambda x: (str(x[0].product_id), str(x[1].pk))
    ):
        balance, _ = InventoryBalance.objects.get_or_create(
            organization=document.organization, product=line.product, location=location
        )
        balance = InventoryBalance.objects.select_for_update().get(pk=balance.pk)
        if balance.on_hand + delta < 0:
            raise Conflict(
                f"Only {balance.on_hand} units of {line.product.sku} available in {location.code}.",
                "INSUFFICIENT_STOCK",
            )
        balance.on_hand += delta
        balance.save(update_fields=["on_hand", "updated_at"])
        StockMovement.objects.create(
            organization=document.organization,
            document=document,
            document_line=line,
            product=line.product,
            location=location,
            delta_quantity=delta,
            quantity_after=balance.on_hand,
            actor=actor,
        )
    document.status, document.posted_by, document.posted_at = "POSTED", actor, timezone.now()
    document.save(update_fields=["status", "posted_by", "posted_at", "updated_at"])
    audit(document.organization, actor, "stock.posted", document, {"movements": len(changes)})
    return document


@transaction.atomic
def post_document(organization, actor, document_id, key):
    lock_organization(organization)
    document = tenant_object(StockDocument, organization, document_id)
    authorize(actor, organization, MANAGERS if document.type == "ADJUST" else OPERATORS)
    if hasattr(document, "goodsreceipt"):
        raise Conflict("Post this document through its goods receipt.")
    record = claim_key(organization, actor, "stock.post", key, {"document": document.pk})
    if record.response:
        return document
    _post_locked(document, actor)
    record.response = {"id": str(document.pk), "status": document.status}
    record.save(update_fields=["response"])
    return document


@transaction.atomic
def void_draft(organization, actor, document_id):
    lock_organization(organization)
    document = tenant_object(StockDocument, organization, document_id)
    authorize(actor, organization, MANAGERS if document.type == "ADJUST" else OPERATORS)
    if document.status != "DRAFT":
        raise Conflict("Only a draft can be voided.")
    document.status = "VOID_DRAFT"
    document.save(update_fields=["status", "updated_at"])
    audit(organization, actor, "stock.voided", document)
    return document
