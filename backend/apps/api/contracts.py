"""Explicit OpenAPI contracts for command and aggregate endpoints."""

from rest_framework import serializers

from .serializers import MovementSerializer


class MessageOutput(serializers.Serializer):
    message = serializers.CharField()


class CsrfOutput(serializers.Serializer):
    csrfToken = serializers.CharField()


class LoginInput(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


class LoginOutput(serializers.Serializer):
    id = serializers.UUIDField()
    username = serializers.CharField()


class MembershipOutput(serializers.Serializer):
    organization = serializers.UUIDField()
    name = serializers.CharField()
    currency = serializers.CharField()
    role = serializers.CharField()


class MeOutput(LoginOutput):
    email = serializers.EmailField()
    memberships = MembershipOutput(many=True)


class EmailInput(serializers.Serializer):
    email = serializers.EmailField()


class ResetInput(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, min_length=12)


class InviteInput(EmailInput):
    role = serializers.ChoiceField(choices=["ADMIN", "MANAGER", "STAFF", "VIEWER"])


class HealthOutput(serializers.Serializer):
    status = serializers.CharField()


class StockRowOutput(serializers.Serializer):
    product = serializers.UUIDField()
    sku = serializers.CharField()
    name = serializers.CharField()
    unit = serializers.CharField()
    on_hand = serializers.IntegerField()
    reorder_level = serializers.IntegerField()
    low_stock = serializers.BooleanField()


class StockReportOutput(serializers.Serializer):
    count = serializers.IntegerField()
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = StockRowOutput(many=True)


class ActivityOutput(serializers.Serializer):
    day = serializers.DateField()
    document__type = serializers.CharField()
    quantity = serializers.IntegerField()
    movements = serializers.IntegerField()


class DashboardOutput(serializers.Serializer):
    active_skus = serializers.IntegerField()
    low_stock_count = serializers.IntegerField()
    open_purchase_orders = serializers.IntegerField()
    movements_today = serializers.IntegerField()
    low_stock = StockRowOutput(many=True)
    recent_movements = MovementSerializer(many=True)
    activity = ActivityOutput(many=True)


class MovementSummaryOutput(serializers.Serializer):
    product__sku = serializers.CharField()
    product__unit__code = serializers.CharField()
    document__type = serializers.CharField()
    net_quantity = serializers.IntegerField()
    movement_count = serializers.IntegerField()
