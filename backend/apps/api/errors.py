from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler as drf_handler


class Conflict(APIException):
    status_code = 409
    default_code = "CONFLICT"

    def __init__(self, message, code="CONFLICT"):
        super().__init__(message, code)


def exception_handler(exc, context):
    response = drf_handler(exc, context)
    if response is not None:
        detail = response.data
        code = exc.get_codes() if hasattr(exc, "get_codes") else "ERROR"
        response.data = {
            "error": {
                "code": code if isinstance(code, str) else "VALIDATION_ERROR",
                "message": str(detail.get("detail", "Please check the submitted fields."))
                if isinstance(detail, dict)
                else str(detail),
                "fields": detail,
                "request_id": getattr(context.get("request"), "request_id", ""),
            }
        }
    return response
