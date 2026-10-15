import json
import logging
import time
import uuid
from contextvars import ContextVar

request_id_context = ContextVar("request_id", default="")
logger = logging.getLogger("stockroom.requests")


class RequestIDMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.request_id = str(uuid.uuid4())
        token = request_id_context.set(request.request_id)
        started = time.monotonic()
        try:
            response = self.get_response(request)
            response["X-Request-ID"] = request.request_id
            logger.info(
                json.dumps(
                    {
                        "request_id": request.request_id,
                        "method": request.method,
                        "path": request.path,
                        "status": response.status_code,
                        "duration_ms": round((time.monotonic() - started) * 1000, 2),
                    }
                )
            )
            return response
        finally:
            request_id_context.reset(token)
