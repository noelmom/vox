import uuid
import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

log = logging.getLogger("api.access")


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Attaches a request_id to every request/response.
    Honours an inbound X-Request-ID header so callers can supply their own.
    The id is stored on request.state.request_id for use in routers and logs.
    """

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id
        started = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = (time.perf_counter() - started) * 1000
            log.exception(
                "HTTP %s %s failed %.1fms client=%s",
                request.method,
                request.url.path,
                duration_ms,
                request.client.host if request.client else "-",
                extra={"request_id": request_id},
            )
            raise

        response.headers["X-Request-ID"] = request_id

        if request.url.path != "/health":
            duration_ms = (time.perf_counter() - started) * 1000
            log.info(
                "HTTP %s %s %s %.1fms client=%s",
                request.method,
                request.url.path,
                response.status_code,
                duration_ms,
                request.client.host if request.client else "-",
                extra={"request_id": request_id},
            )

        return response
