import csv
from datetime import timedelta

from django.db import connection
from django.db.models import Count, Sum
from django.db.models.functions import TruncDate
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema, extend_schema_view
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.api.contracts import (
    DashboardOutput,
    HealthOutput,
    MovementSummaryOutput,
    StockReportOutput,
)
from apps.api.serializers import MovementSerializer
from apps.api.views import TenantMixin
from apps.catalog.models import Product
from apps.inventory.models import InventoryBalance, StockMovement
from apps.purchasing.models import PurchaseOrder


def stock_rows(organization, warehouse=None):
    """Include active zero-stock products; threshold is applied at selected scope."""
    balances = InventoryBalance.objects.filter(organization=organization)
    if warehouse:
        balances = balances.filter(location__warehouse_id=warehouse)
    totals = {
        x["product_id"]: x["quantity"]
        for x in balances.values("product_id").annotate(quantity=Sum("on_hand"))
    }
    return [
        {
            "product": str(p.pk),
            "sku": p.sku,
            "name": p.name,
            "unit": p.unit.code,
            "on_hand": totals.get(p.pk, 0),
            "reorder_level": p.reorder_level,
            "low_stock": totals.get(p.pk, 0) <= p.reorder_level,
        }
        for p in Product.objects.filter(organization=organization, is_active=True)
        .select_related("unit")
        .order_by("sku")
    ]


@extend_schema_view(get=extend_schema(responses=HealthOutput))
class HealthView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return Response({"status": "ok"})


@extend_schema_view(get=extend_schema(responses=DashboardOutput))
class DashboardView(TenantMixin, APIView):
    def get(self, request):
        rows = stock_rows(self.organization)
        movements = StockMovement.objects.filter(organization=self.organization).select_related(
            "product", "location__warehouse", "document", "actor"
        )
        since = timezone.now() - timedelta(days=13)
        activity = list(
            movements.filter(created_at__gte=since)
            .annotate(day=TruncDate("created_at"))
            .values("day", "document__type")
            .annotate(quantity=Sum("delta_quantity"), movements=Count("id"))
            .order_by("day")
        )
        return Response(
            {
                "active_skus": len(rows),
                "low_stock_count": sum(x["low_stock"] for x in rows),
                "open_purchase_orders": PurchaseOrder.objects.filter(
                    organization=self.organization, status__in=["ORDERED", "PARTIALLY_RECEIVED"]
                ).count(),
                "movements_today": movements.filter(created_at__date=timezone.now().date()).count(),
                "low_stock": [x for x in rows if x["low_stock"]][:8],
                "recent_movements": MovementSerializer(movements[:8], many=True).data,
                "activity": activity,
            }
        )


@extend_schema_view(
    get=extend_schema(
        responses=StockReportOutput,
        parameters=[
            OpenApiParameter("warehouse", OpenApiTypes.UUID),
            OpenApiParameter("page", int),
            OpenApiParameter("search", str),
        ],
    )
)
class StockReportView(TenantMixin, APIView):
    read_roles = {"ADMIN", "MANAGER", "VIEWER"}

    def get(self, request, report="stock-on-hand"):
        from rest_framework.pagination import PageNumberPagination

        warehouse = request.query_params.get("warehouse")
        if warehouse:
            from apps.catalog.models import Warehouse
            from apps.inventory.services import tenant_object

            tenant_object(Warehouse, self.organization, warehouse)
        rows = stock_rows(self.organization, warehouse)
        if report == "low-stock":
            rows = [row for row in rows if row["low_stock"]]
        search = request.query_params.get("search", "").lower()
        rows = [row for row in rows if search in (row["sku"] + " " + row["name"]).lower()]
        paginator = PageNumberPagination()
        return paginator.get_paginated_response(paginator.paginate_queryset(rows, request))


def safe_csv(value):
    text = str(value)
    return "'" + text if text.lstrip().startswith(("=", "+", "-", "@", "\t", "\r", "\n")) else text


@extend_schema_view(
    get=extend_schema(
        responses={(200, "text/csv"): OpenApiTypes.STR},
        parameters=[OpenApiParameter("warehouse", OpenApiTypes.UUID)],
    )
)
class StockExportView(TenantMixin, APIView):
    read_roles = {"ADMIN", "MANAGER", "VIEWER"}

    def get(self, request):
        warehouse = request.query_params.get("warehouse")
        if warehouse:
            from apps.catalog.models import Warehouse
            from apps.inventory.services import tenant_object

            tenant_object(Warehouse, self.organization, warehouse)
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="stock-on-hand.csv"'
        writer = csv.writer(response)
        writer.writerow(["SKU", "Product", "Unit", "On hand", "Reorder level"])
        for row in stock_rows(self.organization, warehouse):
            writer.writerow(
                [safe_csv(row[key]) for key in ["sku", "name", "unit", "on_hand", "reorder_level"]]
            )
        return response


@extend_schema_view(
    get=extend_schema(
        responses=MovementSummaryOutput(many=True),
        parameters=[
            OpenApiParameter("start", OpenApiTypes.DATE),
            OpenApiParameter("end", OpenApiTypes.DATE),
        ],
    )
)
class MovementSummaryView(TenantMixin, APIView):
    read_roles = {"ADMIN", "MANAGER", "VIEWER"}

    def get(self, request):
        from rest_framework import serializers

        class Filters(serializers.Serializer):
            start = serializers.DateField(required=False)
            end = serializers.DateField(required=False)

        filters = Filters(data=request.query_params)
        filters.is_valid(raise_exception=True)
        values = filters.validated_data
        if values.get("start") and values.get("end") and values["start"] > values["end"]:
            raise ValidationError("Start date must precede end date.")
        query = StockMovement.objects.filter(organization=self.organization)
        if values.get("start"):
            query = query.filter(created_at__date__gte=values["start"])
        if values.get("end"):
            query = query.filter(created_at__date__lte=values["end"])
        return Response(
            list(
                query.values("product__sku", "product__unit__code", "document__type")
                .annotate(net_quantity=Sum("delta_quantity"), movement_count=Count("id"))
                .order_by("product__sku")
            )
        )
