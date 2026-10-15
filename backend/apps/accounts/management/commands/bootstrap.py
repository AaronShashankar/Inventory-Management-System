from django.contrib.auth.password_validation import validate_password
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import Membership, Organization, User
from apps.catalog.models import Category, Product, StorageLocation, Supplier, Unit, Warehouse
from apps.inventory.services import post_document, save_draft


class Command(BaseCommand):
    help = "Create an organization/admin and optional sample stock. Password is read from ADMIN_PASSWORD."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--organization", default="Himalaya Supply Co.")
        parser.add_argument("--slug", default="himalaya")
        parser.add_argument("--demo", action="store_true")

    @transaction.atomic
    def handle(self, **options):
        import os

        password = os.getenv("ADMIN_PASSWORD")
        if not password:
            raise CommandError("Set ADMIN_PASSWORD; it will not be logged or committed.")
        email = options["email"].lower()
        user, created = User.objects.get_or_create(email=email, defaults={"username": email})
        if created:
            validate_password(password, user)
            user.set_password(password)
            user.save()
        org, _ = Organization.objects.get_or_create(
            slug=options["slug"], defaults={"name": options["organization"]}
        )
        Membership.objects.get_or_create(organization=org, user=user, defaults={"role": "ADMIN"})
        unit, _ = Unit.objects.get_or_create(
            organization=org, code="PCS", defaults={"name": "Pieces"}
        )
        warehouse, _ = Warehouse.objects.get_or_create(
            organization=org,
            code="KTM",
            defaults={"name": "Kathmandu", "address": "Kathmandu, Nepal"},
        )
        location, _ = StorageLocation.objects.get_or_create(
            organization=org, warehouse=warehouse, code="MAIN", defaults={"name": "Main storage"}
        )
        if options["demo"]:
            category, _ = Category.objects.get_or_create(
                organization=org, name="Electronics & accessories"
            )
            Supplier.objects.get_or_create(
                organization=org, name="ABC Electronics", defaults={"email": "orders@example.com"}
            )
            second, _ = Warehouse.objects.get_or_create(
                organization=org, code="PKR", defaults={"name": "Pokhara"}
            )
            StorageLocation.objects.get_or_create(organization=org, warehouse=second, code="MAIN")
            for sku, name, price, quantity, threshold in [
                ("USB-C-001", "USB-C Cable - 1 metre", "250.00", 42, 15),
                ("PWR-020", "20W USB-C Power Adapter", "1200.00", 8, 10),
                ("HUB-007", "7-in-1 USB-C Hub", "3500.00", 24, 8),
                ("AUD-010", "Wireless Earbuds", "2400.00", 6, 12),
                ("MSE-002", "Wireless Mouse", "850.00", 65, 20),
                ("KEY-001", "Mechanical Keyboard", "4200.00", 18, 5),
            ]:
                product, new = Product.objects.get_or_create(
                    organization=org,
                    sku=sku,
                    defaults={
                        "name": name,
                        "unit": unit,
                        "category": category,
                        "default_purchase_price": price,
                        "reorder_level": threshold,
                    },
                )
                if new:
                    document = save_draft(
                        org,
                        user,
                        {
                            "type": "RECEIVE",
                            "destination_location": location,
                            "reason": "OPENING_BALANCE",
                            "lines": [{"product": product, "quantity": quantity}],
                        },
                    )
                    post_document(org, user, document.pk, f"seed-{sku}")
        self.stdout.write(
            self.style.SUCCESS(
                "Organization is ready. Existing passwords and stock were preserved."
            )
        )
