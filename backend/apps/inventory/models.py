from django.conf import settings
from django.db import models

from apps.accounts.models import TenantModel


class DocumentSequence(TenantModel):
    prefix = models.CharField(max_length=12)
    value = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "prefix"], name="unique_sequence")
        ]


class StockDocument(TenantModel):
    class Type(models.TextChoices):
        RECEIVE = "RECEIVE"
        ISSUE = "ISSUE"
        TRANSFER = "TRANSFER"
        ADJUST = "ADJUST"

    document_no = models.CharField(max_length=32)
    type = models.CharField(max_length=12, choices=Type.choices)
    status = models.CharField(
        max_length=12, default="DRAFT", choices=[(x, x) for x in ["DRAFT", "POSTED", "VOID_DRAFT"]]
    )
    source_location = models.ForeignKey(
        "catalog.StorageLocation",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="outgoing_documents",
    )
    destination_location = models.ForeignKey(
        "catalog.StorageLocation",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="incoming_documents",
    )
    reason = models.CharField(max_length=500)
    reference = models.CharField(max_length=120, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_documents"
    )
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.PROTECT,
        related_name="posted_documents",
    )
    posted_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "document_no"], name="unique_document_no"
            )
        ]
        ordering = ["-created_at", "id"]


class StockDocumentLine(models.Model):
    document = models.ForeignKey(StockDocument, on_delete=models.PROTECT, related_name="lines")
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField()
    unit_cost = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    adjustment_direction = models.CharField(
        max_length=3, blank=True, choices=[("IN", "IN"), ("OUT", "OUT")]
    )

    class Meta:
        constraints = [
            models.CheckConstraint(condition=models.Q(quantity__gt=0), name="positive_stock_line"),
            models.UniqueConstraint(fields=["document", "product"], name="unique_stock_line"),
            models.CheckConstraint(
                condition=models.Q(unit_cost__gte=0) | models.Q(unit_cost__isnull=True),
                name="positive_unit_cost",
            ),
        ]


class InventoryBalance(TenantModel):
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT)
    location = models.ForeignKey("catalog.StorageLocation", on_delete=models.PROTECT)
    on_hand = models.BigIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "product", "location"], name="unique_balance"
            ),
            models.CheckConstraint(condition=models.Q(on_hand__gte=0), name="nonnegative_stock"),
        ]


class StockMovement(TenantModel):
    document = models.ForeignKey(StockDocument, on_delete=models.PROTECT)
    document_line = models.ForeignKey(StockDocumentLine, on_delete=models.PROTECT)
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT)
    location = models.ForeignKey("catalog.StorageLocation", on_delete=models.PROTECT)
    delta_quantity = models.BigIntegerField()
    quantity_after = models.BigIntegerField()
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)

    class Meta:
        ordering = ["-created_at", "id"]
        indexes = [models.Index(fields=["organization", "product", "location", "created_at"])]
        constraints = [
            models.CheckConstraint(condition=~models.Q(delta_quantity=0), name="nonzero_movement"),
            models.CheckConstraint(
                condition=models.Q(quantity_after__gte=0), name="nonnegative_movement_after"
            ),
        ]


class IdempotencyRecord(TenantModel):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    key = models.CharField(max_length=128)
    endpoint = models.CharField(max_length=80)
    request_hash = models.CharField(max_length=64)
    response = models.JSONField(default=dict)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "actor", "endpoint", "key"], name="unique_idempotency"
            )
        ]
