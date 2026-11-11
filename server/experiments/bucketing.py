import hashlib


def bucket(experiment_key: str, unit_id, treatment_share: float = 0.5) -> str:
    """Deterministic, sticky assignment: sha256(key:unit) mapped to [0, 1)."""
    h = hashlib.sha256(f"{experiment_key}:{unit_id}".encode()).digest()
    u = int.from_bytes(h[:8], "big") / 2 ** 64
    return "treatment" if u < treatment_share else "control"
