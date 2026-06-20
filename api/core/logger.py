import logging
import sys


class RequestIDFilter(logging.Filter):
    """Injects request_id='-' into any log record that doesn't already have one."""
    def filter(self, record):
        if not hasattr(record, "request_id"):
            record.request_id = "-"
        return True


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


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
