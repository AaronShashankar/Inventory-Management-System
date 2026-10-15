from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Sum

from apps.accounts.models import Organization
from apps.inventory.models import InventoryBalance, StockMovement


class Command(BaseCommand):
    help = "Read-only ledger reconciliation; exits nonzero on any mismatch."

    def handle(self, **options):
        mismatches = []
        for organization in Organization.objects.order_by("pk"):
            with transaction.atomic():
                Organization.objects.select_for_update().get(pk=organization.pk)
                ledger = {
                    (x["product_id"], x["location_id"]): x["total"]
                    for x in StockMovement.objects.filter(organization=organization)
                    .values("product_id", "location_id")
                    .annotate(total=Sum("delta_quantity"))
                }
                balances = {
                    (x.product_id, x.location_id): x.on_hand
                    for x in InventoryBalance.objects.filter(organization=organization)
                }
                for key in ledger.keys() | balances.keys():
                    if ledger.get(key, 0) != balances.get(key, 0):
                        mismatches.append(f"{organization.pk}: {key}")
        if mismatches:
            raise CommandError("Ledger mismatch: " + "; ".join(mismatches))
        self.stdout.write(self.style.SUCCESS("All balances reconcile with the movement ledger."))
