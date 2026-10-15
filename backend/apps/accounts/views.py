from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.db import transaction
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.views.decorators.csrf import csrf_protect
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Membership, User
from apps.accounts.services import audit, authorize, lock_organization
from apps.api.contracts import (
    CsrfOutput,
    EmailInput,
    InviteInput,
    LoginInput,
    LoginOutput,
    MeOutput,
    MessageOutput,
    ResetInput,
)
from apps.api.views import TenantMixin


class Credentials(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=256, trim_whitespace=False)


@extend_schema_view(get=extend_schema(responses=CsrfOutput))
class CsrfView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"csrfToken": get_token(request)})


@method_decorator(csrf_protect, name="dispatch")
@extend_schema_view(post=extend_schema(request=LoginInput, responses=LoginOutput))
class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "auth"

    def post(self, request):
        data = Credentials(data=request.data)
        data.is_valid(raise_exception=True)
        user = authenticate(request, **data.validated_data)
        if not user:
            raise ValidationError("Invalid username or password.")
        login(request, user)
        return Response({"id": user.pk, "username": user.username})


@extend_schema_view(post=extend_schema(request=None, responses={204: None}))
class LogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response(status=204)


@extend_schema_view(get=extend_schema(responses=MeOutput))
class MeView(APIView):
    def get(self, request):
        memberships = Membership.objects.filter(user=request.user, is_active=True).select_related(
            "organization"
        )
        return Response(
            {
                "id": request.user.pk,
                "username": request.user.username,
                "email": request.user.email,
                "memberships": [
                    {
                        "organization": str(m.organization_id),
                        "name": m.organization.name,
                        "currency": m.organization.base_currency,
                        "role": m.role,
                    }
                    for m in memberships
                ],
            }
        )


def send_reset(user, invitation=False):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    link = f"{settings.PUBLIC_APP_URL}/reset-password/{uid}/{token}"
    send_mail(
        "Set your Stockroom password" if invitation else "Reset your Stockroom password",
        f"Use this link within one hour: {link}\nIf you did not request this, ignore this email.",
        settings.DEFAULT_FROM_EMAIL,
        [user.email],
    )


@method_decorator(csrf_protect, name="dispatch")
@extend_schema_view(post=extend_schema(request=EmailInput, responses=MessageOutput))
class ResetRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "auth"

    def post(self, request):
        email = serializers.EmailField().run_validation(request.data.get("email"))
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user:
            send_reset(user)
        return Response({"message": "If this account exists, a reset link has been sent."})


@method_decorator(csrf_protect, name="dispatch")
@extend_schema_view(post=extend_schema(request=ResetInput, responses=MessageOutput))
class ResetConfirmView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "auth"

    def post(self, request):
        class Input(serializers.Serializer):
            uid = serializers.CharField(max_length=100)
            token = serializers.CharField(max_length=100)
            password = serializers.CharField(max_length=256, trim_whitespace=False)

        data = Input(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            try:
                user = User.objects.select_for_update().get(
                    pk=urlsafe_base64_decode(data.validated_data["uid"]).decode()
                )
            except (
                ValueError,
                TypeError,
                UnicodeDecodeError,
                User.DoesNotExist,
                DjangoValidationError,
            ):
                raise ValidationError("Invalid or expired reset link.") from None
            if not default_token_generator.check_token(user, data.validated_data["token"]):
                raise ValidationError("Invalid or expired reset link.")
            try:
                validate_password(data.validated_data["password"], user)
            except DjangoValidationError as exc:
                raise ValidationError({"password": exc.messages}) from exc
            user.set_password(data.validated_data["password"])
            user.save(update_fields=["password"])
        return Response({"message": "Password updated. You can now sign in."})


@extend_schema_view(post=extend_schema(request=InviteInput, responses={201: MessageOutput}))
class InviteView(TenantMixin, APIView):
    write_roles = {"ADMIN"}

    def post(self, request):
        class Input(serializers.Serializer):
            email = serializers.EmailField(max_length=150)
            role = serializers.ChoiceField(choices=Membership.Role.choices)

        data = Input(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            lock_organization(self.organization)
            authorize(request.user, self.organization, {"ADMIN"})
            email = data.validated_data["email"].lower()
            user, created = User.objects.get_or_create(email=email, defaults={"username": email})
            if created:
                user.set_unusable_password()
                user.save(update_fields=["password"])
            member, new = Membership.objects.get_or_create(
                organization=self.organization,
                user=user,
                defaults={"role": data.validated_data["role"]},
            )
            if not new:
                raise ValidationError("This person already has a membership; edit it in Team.")
            audit(self.organization, request.user, "membership.invited", member)
            if created:
                transaction.on_commit(lambda: send_reset(user, invitation=True))
        return Response(
            {"message": "Membership created. New users receive a password setup email."}, status=201
        )


class OrganizationInput(serializers.Serializer):
    name = serializers.CharField(max_length=160, required=False)
    base_currency = serializers.RegexField(r"^[A-Z]{3}$", required=False)


@extend_schema_view(
    get=extend_schema(responses=OrganizationInput),
    patch=extend_schema(request=OrganizationInput, responses=OrganizationInput),
)
class OrganizationView(TenantMixin, APIView):
    write_roles = {"ADMIN"}

    def get(self, request):
        return Response(
            {"name": self.organization.name, "base_currency": self.organization.base_currency}
        )

    def patch(self, request):
        from apps.api.errors import Conflict
        from apps.catalog.models import Product

        data = OrganizationInput(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            organization = lock_organization(self.organization)
            authorize(request.user, organization, {"ADMIN"})
            currency = data.validated_data.get("base_currency", organization.base_currency)
            if (
                currency != organization.base_currency
                and Product.objects.filter(organization=organization).exists()
            ):
                raise Conflict(
                    "Base currency cannot change after products have been created. Use an explicit financial migration."
                )
            for key, value in data.validated_data.items():
                setattr(organization, key, value)
            organization.save(update_fields=list(data.validated_data))
            audit(
                organization,
                request.user,
                "organization.updated",
                organization,
                data.validated_data,
            )
        return Response({"name": organization.name, "base_currency": organization.base_currency})
