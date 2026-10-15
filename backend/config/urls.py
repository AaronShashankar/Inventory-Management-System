from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter

from apps.accounts.views import (
    CsrfView,
    InviteView,
    LoginView,
    LogoutView,
    MeView,
    OrganizationView,
    ResetConfirmView,
    ResetRequestView,
)
from apps.api.views import (
    AuditViewSet,
    BalanceViewSet,
    CategoryViewSet,
    LocationViewSet,
    MemberViewSet,
    MovementViewSet,
    OrderViewSet,
    ProductViewSet,
    ReceiptViewSet,
    StockViewSet,
    SupplierViewSet,
    UnitViewSet,
    WarehouseViewSet,
)
from apps.reporting.views import (
    DashboardView,
    HealthView,
    MovementSummaryView,
    StockExportView,
    StockReportView,
)

router = DefaultRouter()
for route, view in [
    ("products", ProductViewSet),
    ("categories", CategoryViewSet),
    ("units", UnitViewSet),
    ("suppliers", SupplierViewSet),
    ("warehouses", WarehouseViewSet),
    ("locations", LocationViewSet),
    ("stock-documents", StockViewSet),
    ("inventory/balances", BalanceViewSet),
    ("inventory/movements", MovementViewSet),
    ("purchase-orders", OrderViewSet),
    ("goods-receipts", ReceiptViewSet),
    ("audit-events", AuditViewSet),
    ("members", MemberViewSet),
]:
    router.register(route, view)
urlpatterns = [path("api/v1/", include(router.urls))]
for route, view in [
    ("auth/csrf/", CsrfView),
    ("auth/login/", LoginView),
    ("auth/logout/", LogoutView),
    ("auth/me/", MeView),
    ("auth/password-reset/request/", ResetRequestView),
    ("auth/password-reset/confirm/", ResetConfirmView),
    ("members/invite/", InviteView),
    ("dashboard/summary/", DashboardView),
    ("health/", HealthView),
    ("reports/stock-on-hand/", StockReportView),
    ("reports/movement-summary/", MovementSummaryView),
    ("reports/stock-on-hand/export.csv", StockExportView),
]:
    urlpatterns.insert(0, path("api/v1/" + route, view.as_view()))
urlpatterns += [
    path("api/v1/reports/low-stock/", StockReportView.as_view(), {"report": "low-stock"}),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema")),
]

urlpatterns += [path("api/v1/organization/", OrganizationView.as_view())]
