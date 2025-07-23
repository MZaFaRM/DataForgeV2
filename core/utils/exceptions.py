class MissingRequiredAttributeError(Exception):
    pass


class VerificationError(Exception):
    pass


class ValidationWarning(Exception):
    pass


class ValidationError(Exception):
    pass

class ManualException(Exception):
    pass