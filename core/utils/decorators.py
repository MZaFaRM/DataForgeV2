from functools import wraps
from core.utils.exceptions import MissingRequiredAttributeError


def requires(*attrs: str, error_msg: str = ""):
    def decorator(func):
        @wraps(func)
        def wrapper(self, *args, **kwargs):
            for attr_name in attrs:
                if getattr(self, attr_name, None) in [None, ""]:
                    raise MissingRequiredAttributeError(
                        error_msg or f"'{attr_name}' is required but not initialized."
                    )
            return func(self, *args, **kwargs)

        return wrapper

    return decorator


def with_cache(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        cache = {}
        try:
            return func(*args, **kwargs, cache=cache)
        finally:
            cache.clear()

    return wrapper
