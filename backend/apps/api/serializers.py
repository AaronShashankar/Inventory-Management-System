from decimal import Decimal

from rest_framework import serializers

from apps.accounts.models import AuditEvent, Membership
from apps.catalog.models import Category, Product, StorageLocation, Supplier, Unit, Warehouse
from apps.inventory.models import InventoryBalance, StockDocument, StockDocumentLine, StockMovement
from apps.purchasing.models import GoodsReceipt, PurchaseOrder, PurchaseOrderLine
from apps.purchasing.services import received_quantity


class TenantSerializer(serializers.ModelSerializer):
    """Scope relation choices before validating; caller cannot supply a tenant ID."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        org = self.context.get("organization")
        for field in self.fields.values():
            if isinstance(field, serializers.PrimaryKeyRelatedField) and field.queryset is not None:
                if hasattr(field.queryset.model, "organization"):
                    field.queryset = field.queryset.filter(organization=org)

    class Meta:
        fields = "__all__"
        read_only_fields = ["id", "organization", "created_at", "updated_at"]
        validators = []


class CategorySerializer(TenantSerializer):
    class Meta(TenantSerializer.Meta):
        model = Category


class UnitSerializer(TenantSerializer):
    class Meta(TenantSerializer.Meta):
        model = Unit


class ProductSerializer(TenantSerializer):
    default_purchase_price = serializers.DecimalField(
        max_digits=14, decimal_places=2, min_value=Decimal("0"), required=False
    )
    category_name = serializers.CharField(
        source="category.name", read_only=True, default="Uncategorized"
    )
    unit_code = serializers.CharField(source="unit.code", read_only=True)

    class Meta(TenantSerializer.Meta):
        model = Product


class SupplierSerializer(TenantSerializer):
    class Meta(TenantSerializer.Meta):
        model = Supplier


class WarehouseSerializer(TenantSerializer):
    class Meta(TenantSerializer.Meta):
        model = Warehouse


class LocationSerializer(TenantSerializer):
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)

    class Meta(TenantSerializer.Meta):
        model = StorageLocation


class StockLineSerializer(TenantSerializer):
    quantity = serializers.IntegerField(min_value=1, max_value=2147483647)
    product_name = serializers.CharField(source="product.name", read_only=True)
    sku = serializers.CharField(source="product.sku", read_only=True)

    class Meta:
        model = StockDocumentLine
        fields = [
            "id",
            "product",
            "product_name",
            "sku",
            "quantity",
            "unit_cost",
            "adjustment_direction",
        ]


class StockSerializer(TenantSerializer):
    receipt_id = serializers.UUIDField(source="goodsreceipt.pk", read_only=True, default=None)
    lines = StockLineSerializer(many=True)
    source_name = serializers.CharField(source="source_location.code", read_only=True)
    destination_name = serializers.CharField(source="destination_location.code", read_only=True)

    def get_fields(self):
        fields = super().get_fields()
        fields["lines"] = StockLineSerializer(many=True, context=self.context)
        return fields

    class Meta(TenantSerializer.Meta):
        model = StockDocument
        read_only_fields = TenantSerializer.Meta.read_only_fields + [
            "document_no",
            "status",
            "created_by",
            "posted_by",
            "posted_at",
        ]


class BalanceSerializer(TenantSerializer):
    sku = serializers.CharField(source="product.sku")
    product_name = serializers.CharField(source="product.name")
    warehouse_name = serializers.CharField(source="location.warehouse.name")
    location_code = serializers.CharField(source="location.code")
    unit_code = serializers.CharField(source="product.unit.code")
    reorder_level = serializers.IntegerField(source="product.reorder_level")

    class Meta(TenantSerializer.Meta):
        model = InventoryBalance


class MovementSerializer(TenantSerializer):
    sku = serializers.CharField(source="product.sku")
    product_name = serializers.CharField(source="product.name")
    warehouse_name = serializers.CharField(source="location.warehouse.name")
    location_code = serializers.CharField(source="location.code")
    document_no = serializers.CharField(source="document.document_no")
    type = serializers.CharField(source="document.type")
    reference = serializers.CharField(source="document.reference")
    actor_name = serializers.CharField(source="actor.username")

    class Meta(TenantSerializer.Meta):
        model = StockMovement


class OrderLineSerializer(TenantSerializer):
    ordered_qty = serializers.IntegerField(min_value=1, max_value=2147483647)
    unit_price = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0"))
    received_qty = serializers.SerializerMethodField()
    product_name = serializers.CharField(source="product.name", read_only=True)

    def get_received_qty(self, line) -> int:
        return received_quantity(line)

    class Meta:
        model = PurchaseOrderLine
        fields = ["id", "product", "product_name", "ordered_qty", "unit_price", "received_qty"]


class OrderSerializer(TenantSerializer):
    lines = OrderLineSerializer(many=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    total = serializers.SerializerMethodField()

    def get_total(self, order) -> str:
        return str(
            sum((line.unit_price * line.ordered_qty for line in order.lines.all()), Decimal("0.00"))
        )

    def get_fields(self):
        fields = super().get_fields()
        fields["lines"] = OrderLineSerializer(many=True, context=self.context)
        return fields

    class Meta(TenantSerializer.Meta):
        model = PurchaseOrder
        read_only_fields = TenantSerializer.Meta.read_only_fields + [
            "po_number",
            "status",
            "created_by",
            "submitted_at",
            "closed_at",
        ]


class ReceiptInputSerializer(serializers.Serializer):
    purchase_order = serializers.UUIDField()
    location = serializers.UUIDField()
    lines = serializers.ListField(child=serializers.DictField(), min_length=1, max_length=100)

    def validate_lines(self, lines):
        class Line(serializers.Serializer):
            purchase_order_line = serializers.IntegerField(min_value=1)
            received_qty = serializers.IntegerField(min_value=1, max_value=2147483647)

        validator = Line(data=lines, many=True)
        validator.is_valid(raise_exception=True)
        return validator.validated_data


class ReceiptSerializer(TenantSerializer):
    lines = StockLineSerializer(source="stock_document.lines", many=True, read_only=True)
    location = serializers.CharField(
        source="stock_document.destination_location.code", read_only=True
    )
    warehouse = serializers.CharField(
        source="stock_document.destination_location.warehouse.name", read_only=True
    )
    status = serializers.CharField(source="stock_document.status")
    po_number = serializers.CharField(source="purchase_order.po_number")

    class Meta(TenantSerializer.Meta):
        model = GoodsReceipt


class AuditSerializer(TenantSerializer):
    actor_name = serializers.CharField(source="actor.username", default="System")

    class Meta(TenantSerializer.Meta):
        model = AuditEvent


class MemberSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    name = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = Membership
        fields = ["id", "email", "name", "role", "is_active"]
