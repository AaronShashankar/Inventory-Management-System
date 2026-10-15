from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.accounts.models import AuditEvent, Membership
from apps.accounts.services import (
    ALL_ROLES,
    MANAGERS,
    OPERATORS,
    audit,
    authorize,
    lock_organization,
    update_member,
)
from apps.api.errors import Conflict
from apps.catalog.models import Category, Product, StorageLocation, Supplier, Unit, Warehouse
from apps.inventory.models import InventoryBalance, StockDocument, StockMovement
from apps.inventory.services import post_document, save_draft, tenant_object, void_draft
from apps.purchasing.models import GoodsReceipt, PurchaseOrder
from apps.purchasing.services import create_receipt, post_receipt, save_order, transition_order

from .serializers import (
    AuditSerializer,
    BalanceSerializer,
    CategorySerializer,
    LocationSerializer,
    MemberSerializer,
    MovementSerializer,
    OrderSerializer,
    ProductSerializer,
    ReceiptInputSerializer,
    ReceiptSerializer,
    StockSerializer,
    SupplierSerializer,
    UnitSerializer,
    WarehouseSerializer,
)


class TenantMixin:
    read_roles = ALL_ROLES
    write_roles = MANAGERS

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        memberships = Membership.objects.filter(user=request.user, is_active=True).select_related(
            "organization"
        )
        org_id = request.headers.get("X-Organization-ID")
        try:
            membership = (
                memberships.filter(organization_id=org_id).first()
                if org_id
                else memberships.order_by("id").first()
            )
        except (ValueError, ValidationError, DjangoValidationError):
            membership = None
        if not membership:
            raise PermissionDenied("No active membership for this organization.")
        self.organization = membership.organization
        authorize(
            request.user,
            self.organization,
            self.read_roles if request.method in ("GET", "HEAD", "OPTIONS") else self.write_roles,
        )

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return super().get_queryset().none()
        return (
            super()
            .get_queryset()
            .filter(organization=self.organization)
            .order_by("-created_at", "pk")
        )

    def get_serializer_context(self):
        return {
            **super().get_serializer_context(),
            "organization": getattr(self, "organization", None),
        }


class MasterViewSet(
    TenantMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    http_method_names = ["get", "post", "patch", "head", "options"]

    def persist(self, serializer):
        try:
            with transaction.atomic():
                lock_organization(self.organization)
                authorize(self.request.user, self.organization, self.write_roles)
                if serializer.instance:
                    serializer.instance = self.queryset.model.objects.get(
                        pk=serializer.instance.pk, organization=self.organization
                    )
                    if (
                        isinstance(serializer.instance, Product)
                        and "unit" in serializer.validated_data
                        and serializer.validated_data["unit"].pk != serializer.instance.unit_id
                        and StockDocument.objects.filter(
                            lines__product=serializer.instance
                        ).exists()
                    ):
                        raise Conflict("The stock unit cannot change after use in a document.")
                    if (
                        isinstance(serializer.instance, StorageLocation)
                        and "warehouse" in serializer.validated_data
                        and serializer.validated_data["warehouse"].pk
                        != serializer.instance.warehouse_id
                        and (
                            StockDocument.objects.filter(
                                source_location=serializer.instance
                            ).exists()
                            or StockDocument.objects.filter(
                                destination_location=serializer.instance
                            ).exists()
                        )
                    ):
                        raise Conflict("A used bin cannot move between warehouses.")
                obj = serializer.save(organization=self.organization)
                audit(
                    self.organization,
                    self.request.user,
                    "master.saved",
                    obj,
                    {"fields": sorted(serializer.validated_data.keys())},
                )
                if isinstance(obj, Warehouse):
                    StorageLocation.objects.get_or_create(
                        organization=self.organization,
                        warehouse=obj,
                        code="MAIN",
                        defaults={"name": "Main storage"},
                    )
        except IntegrityError:
            raise Conflict(
                "A record with these identifying fields already exists.", "DUPLICATE_RECORD"
            ) from None

    perform_create = persist
    perform_update = persist


class ProductViewSet(MasterViewSet):
    queryset = Product.objects.select_related("category", "unit")
    serializer_class = ProductSerializer
    search_fields = ["sku", "name", "barcode"]
    filterset_fields = ["is_active", "category"]


class CategoryViewSet(MasterViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer


class UnitViewSet(MasterViewSet):
    queryset = Unit.objects.all()
    serializer_class = UnitSerializer


class SupplierViewSet(MasterViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    search_fields = ["name", "email"]


class WarehouseViewSet(MasterViewSet):
    queryset = Warehouse.objects.all()
    serializer_class = WarehouseSerializer


class LocationViewSet(MasterViewSet):
    queryset = StorageLocation.objects.select_related("warehouse")
    serializer_class = LocationSerializer
    filterset_fields = ["warehouse", "is_active"]


class StockViewSet(
    TenantMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin, viewsets.ReadOnlyModelViewSet
):
    queryset = StockDocument.objects.select_related(
        "source_location", "destination_location"
    ).prefetch_related("lines__product")
    serializer_class = StockSerializer
    write_roles = OPERATORS
    http_method_names = ["get", "post", "patch", "head", "options"]
    filterset_fields = ["status", "type"]

    def perform_create(self, serializer):
        serializer.instance = save_draft(
            self.organization, self.request.user, serializer.validated_data
        )

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.instance = save_draft(
            self.organization, request.user, serializer.validated_data, instance.pk
        )
        return Response(serializer.data)

    @extend_schema(
        request=None,
        parameters=[
            OpenApiParameter("Idempotency-Key", str, OpenApiParameter.HEADER, required=True)
        ],
    )
    @action(detail=True, methods=["post"])
    def post(self, request, pk=None):
        if request.data:
            raise ValidationError("Posting takes an empty body; save changes to the draft first.")
        document = post_document(
            self.organization, request.user, pk, request.headers.get("Idempotency-Key")
        )
        return Response(self.get_serializer(document).data)

    @action(detail=True, methods=["post"], url_path="void-draft")
    def void(self, request, pk=None):
        return Response(self.get_serializer(void_draft(self.organization, request.user, pk)).data)


class BalanceViewSet(TenantMixin, viewsets.ReadOnlyModelViewSet):
    queryset = InventoryBalance.objects.select_related("product__unit", "location__warehouse")
    serializer_class = BalanceSerializer
    filterset_fields = ["product", "location", "location__warehouse"]
    search_fields = ["product__sku", "product__name"]


class MovementViewSet(TenantMixin, viewsets.ReadOnlyModelViewSet):
    queryset = StockMovement.objects.select_related(
        "product", "location__warehouse", "document", "actor"
    )
    serializer_class = MovementSerializer
    filterset_fields = {
        "product": ["exact"],
        "location": ["exact"],
        "location__warehouse": ["exact"],
        "document__type": ["exact"],
        "created_at": ["gte", "lte"],
    }
    search_fields = ["product__sku", "product__name", "document__document_no"]


class OrderViewSet(
    TenantMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin, viewsets.ReadOnlyModelViewSet
):
    queryset = PurchaseOrder.objects.select_related("supplier").prefetch_related(
        "lines__product", "lines__receipt_lines"
    )
    serializer_class = OrderSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]
    filterset_fields = ["status"]

    def perform_create(self, serializer):
        serializer.instance = save_order(
            self.organization, self.request.user, serializer.validated_data
        )

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.instance = save_order(
            self.organization, request.user, serializer.validated_data, instance.pk
        )
        return Response(serializer.data)

    @extend_schema(request=None)
    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        return self.transition(pk, "submit")

    @extend_schema(request=None)
    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        return self.transition(pk, "close")

    @extend_schema(request=None)
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        return self.transition(pk, "cancel")

    def transition(self, pk, command):
        return Response(
            self.get_serializer(
                transition_order(self.organization, self.request.user, pk, command)
            ).data
        )


class ReceiptViewSet(TenantMixin, mixins.CreateModelMixin, viewsets.ReadOnlyModelViewSet):
    queryset = GoodsReceipt.objects.select_related("stock_document", "purchase_order")
    serializer_class = ReceiptSerializer
    write_roles = OPERATORS

    @extend_schema(request=ReceiptInputSerializer, responses={201: ReceiptSerializer})
    def create(self, request):
        serializer = ReceiptInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        receipt = create_receipt(
            self.organization,
            request.user,
            data["purchase_order"],
            tenant_object(StorageLocation, self.organization, data["location"]),
            data["lines"],
        )
        return Response(self.get_serializer(receipt).data, status=201)

    @extend_schema(
        request=None,
        parameters=[
            OpenApiParameter("Idempotency-Key", str, OpenApiParameter.HEADER, required=True)
        ],
    )
    @action(detail=True, methods=["post"])
    def post(self, request, pk=None):
        if request.data:
            raise ValidationError("Posting takes an empty body.")
        return Response(
            self.get_serializer(
                post_receipt(
                    self.organization, request.user, pk, request.headers.get("Idempotency-Key")
                )
            ).data
        )


class AuditViewSet(TenantMixin, viewsets.ReadOnlyModelViewSet):
    queryset = AuditEvent.objects.select_related("actor")
    serializer_class = AuditSerializer
    read_roles = {"ADMIN", "MANAGER", "VIEWER"}


class MemberViewSet(
    TenantMixin, mixins.ListModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    queryset = Membership.objects.select_related("user")
    serializer_class = MemberSerializer
    read_roles = {"ADMIN"}
    write_roles = {"ADMIN"}
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self):
        return self.queryset.filter(organization=self.organization).order_by("id")

    def perform_update(self, serializer):
        serializer.instance = update_member(
            self.request.user, self.organization, serializer.instance, serializer.validated_data
        )
