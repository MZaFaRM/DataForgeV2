import ast
from functools import wraps
import multiprocessing
from numbers import Number

import faker
from pydantic import BaseModel


def cap_value(
    value: str | float | None,
    length: int | None,
    precision: int | None,
    scale: int | None,
) -> str | float | None:
    if value is None:
        return None

    if isinstance(value, str):
        return cap_string(value, length)

    if isinstance(value, float):
        return cap_numeric(value, precision, scale)

    raise TypeError(
        f"Unsupported type for value: {type(value)}. Expected str or float."
    )


def cap_numeric(value: float, precision: int | None, scale: int | None) -> float:
    if precision is None:
        return value

    scale = scale or 0
    if scale > precision:
        raise ValueError(
            f"Invalid SQL definition: scale ({scale}) > precision ({precision})"
        )

    max_whole_digits = precision - scale
    if scale > 0:
        max_value = float(f"{'9' * max_whole_digits}.{ '9' * scale }")
    else:
        max_value = float(f"{'9' * max_whole_digits}")

    min_value = -max_value
    return max(min(value, max_value), min_value)


def cap_string(value: str, length: int | None) -> str:
    if length is not None:
        return value[:length]
    return value


def requires(*required_keys: str | type[BaseModel], connected: bool = False):
    def decorator(func):
        @wraps(func)
        def wrapper(self, body: dict | None = None):
            if connected and not hasattr(self.dbf, "_id"):
                return self._err("Request requires connection to a database.")

            missing = []
            fields = []
            for field in required_keys:
                if isinstance(field, type) and issubclass(field, BaseModel):
                    fields.extend(
                        name
                        for name, f in field.model_fields.items()
                        if f.is_required()
                    )
                else:
                    fields.append(field)

            if isinstance(body, dict):
                missing = [key for key in fields if key not in body]
            elif fields:
                missing = fields

            if missing:
                msg = (
                    f"Missing required parameter: {missing[0]}"
                    if len(missing) == 1
                    else f"Missing required parameters: {', '.join(missing[:-1])}, and {missing[-1]}"
                )
                return self._err(msg)
            else:
                return func(self, body)

        return wrapper

    return decorator


def safe_eval(code: str, context: dict, result_queue: multiprocessing.Queue):
    try:
        tree = ast.parse(code)
        env = {
            "faker": faker,
            "columns": {},
            "order": lambda x: (lambda f: f),
            "__builtins__": __builtins__,
        }
        exec(compile(tree, filename="<ast>", mode="exec"), env)
        gen = env["generator"]

        rows = []
        for idx in range(context["n"]):
            columns = {key: context["entries"][key][idx] for key in context["entries"]}
            val = gen(columns=columns)
            rows.append(str(val))
        result_queue.put(rows)
    except Exception as e:
        result_queue.put(e)
