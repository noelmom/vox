import logging
import sys


class RequestIDFilter(logging.Filter):
    """Injects request_id='-' into any log record that doesn't already have one."""
    def filter(self, record):
        if not hasattr(record, "request_id"):
            record.request_id = "-"
        return True


class _HealthCheckFilter(logging.Filter):
    """Drops uvicorn access log lines for successful /health polls."""
    def filter(self, record):
        msg = record.getMessage()
        return not ("GET /health" in msg and "200" in msg)


def setup_logging():
    fmt = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] request_id=%(request_id)s %(name)s: %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(fmt)
    # Add the filter to the handler so ALL loggers (including third-party) get request_id
    handler.addFilter(RequestIDFilter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)

    # Suppress chatty third-party INFO logs that aren't actionable
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)

    # Drop successful /health polls from the access log — the menu bar helper
    # hits this every 5s which would produce ~17k log lines per day of pure noise
    logging.getLogger("uvicorn.access").addFilter(_HealthCheckFilter())


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
