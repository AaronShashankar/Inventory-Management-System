from django.db import transaction
from rest_framework.exceptions import PermissionDenied

from apps.accounts.models import AuditEvent, Membership, Organization
from apps.api.middleware import request_id_context

ALL_ROLES = {"ADMIN", "MANAGER", "STAFF", "VIEWER"}
MANAGERS = {"ADMIN", "MANAGER"}
OPERATORS = {"ADMIN", "MANAGER", "STAFF"}


def authorize(actor, organization, roles=ALL_ROLES):
    if (
        not actor.is_active
        or not Membership.objects.filter(
            user=actor, organization=organization, is_active=True, role__in=roles
        ).exists()
    ):
        raise PermissionDenied("Your role does not permit this action.")


def audit(organization, actor, action, entity, details=None):
    return AuditEvent.objects.create(
        organization=organization,
        actor=actor,
        action=action,
        entity_type=entity._meta.label,
        entity_id=str(entity.pk),
        details=details or {},
        request_id=request_id_context.get(),
    )


def lock_organization(organization):
    """Serialize tenant mutations: a deliberately conservative MVP locking boundary."""
    return Organization.objects.select_for_update().get(pk=organization.pk)


@transaction.atomic
def update_member(actor, organization, member, changes):
    lock_organization(organization)
    authorize(actor, organization, {"ADMIN"})
    member = Membership.objects.get(pk=member.pk)
    if member.organization_id != organization.pk:
        raise PermissionDenied()
    if member.role == "ADMIN" and (
        changes.get("role", member.role) != "ADMIN"
        or not changes.get("is_active", member.is_active)
    ):
        if (
            not Membership.objects.filter(organization=organization, role="ADMIN", is_active=True)
            .exclude(pk=member.pk)
            .exists()
        ):
            raise PermissionDenied("Keep at least one active administrator.")
    for key, value in changes.items():
        setattr(member, key, value)
    member.save()
    audit(organization, actor, "membership.updated", member, changes)
    return member
