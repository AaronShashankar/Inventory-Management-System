from django.db import models

from apps.accounts.models import TenantModel


class Category(TenantModel):
    name = models.CharField(max_length=120)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "name"], name="unique_category")
        ]


class Unit(TenantModel):
    code = models.CharField(max_length=12)
    name = models.CharField(max_length=80)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "code"], name="unique_unit")]


class Product(TenantModel):
    sku = models.CharField(max_length=64)
    name = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    barcode = models.CharField(max_length=64, blank=True)
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.PROTECT)
    unit = models.ForeignKey(Unit, on_delete=models.PROTECT)
    reorder_level = models.PositiveIntegerField(default=0)
    default_purchase_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "sku"], name="unique_sku"),
            models.CheckConstraint(
                condition=models.Q(default_purchase_price__gte=0), name="positive_reference_price"
            ),
        ]


class Supplier(TenantModel):
    name = models.CharField(max_length=160)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)


class Warehouse(TenantModel):
    code = models.CharField(max_length=20)
    name = models.CharField(max_length=160)
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "code"], name="unique_warehouse")
        ]


class StorageLocation(TenantModel):
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="locations")
    code = models.CharField(max_length=32)
    name = models.CharField(max_length=120, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["warehouse", "code"], name="unique_bin")]
