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
