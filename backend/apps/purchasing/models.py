from django.conf import settings
from django.db import models

from apps.accounts.models import TenantModel


class PurchaseOrder(TenantModel):
    po_number = models.CharField(max_length=32)
    supplier = models.ForeignKey("catalog.Supplier", on_delete=models.PROTECT)
    status = models.CharField(max_length=24, default="DRAFT")
    expected_date = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    submitted_at = models.DateTimeField(null=True)
    closed_at = models.DateTimeField(null=True)

    class Meta:
        ordering = ["-created_at", "id"]
        constraints = [
            models.UniqueConstraint(fields=["organization", "po_number"], name="unique_po_number")
        ]


class PurchaseOrderLine(models.Model):
    purchase_order = models.ForeignKey(
        PurchaseOrder, on_delete=models.PROTECT, related_name="lines"
    )
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT)
    ordered_qty = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(ordered_qty__gt=0), name="positive_po_quantity"
            ),
            models.CheckConstraint(condition=models.Q(unit_price__gte=0), name="positive_po_price"),
            models.UniqueConstraint(fields=["purchase_order", "product"], name="unique_po_product"),
        ]


class GoodsReceipt(TenantModel):
    receipt_number = models.CharField(max_length=32)
    purchase_order = models.ForeignKey(
        PurchaseOrder, on_delete=models.PROTECT, related_name="receipts"
    )
    stock_document = models.OneToOneField("inventory.StockDocument", on_delete=models.PROTECT)

    class Meta:
        ordering = ["-created_at", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "receipt_number"], name="unique_receipt_number"
            )
        ]


class GoodsReceiptLine(models.Model):
    goods_receipt = models.ForeignKey(GoodsReceipt, on_delete=models.PROTECT, related_name="lines")
    purchase_order_line = models.ForeignKey(
        PurchaseOrderLine, on_delete=models.PROTECT, related_name="receipt_lines"
    )
    received_qty = models.PositiveIntegerField()

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(received_qty__gt=0), name="positive_received_qty"
            ),
            models.UniqueConstraint(
                fields=["goods_receipt", "purchase_order_line"], name="unique_receipt_line"
            ),
        ]
