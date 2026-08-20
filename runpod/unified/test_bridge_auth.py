import importlib.util
from pathlib import Path
import unittest


AUTH_PATH = Path(__file__).with_name("bridge") / "auth.py"
SPEC = importlib.util.spec_from_file_location("unified_bridge_auth", AUTH_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load bridge auth helpers from {AUTH_PATH}")
AUTH = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUTH)
authorization_error = AUTH.authorization_error
bearer_header = AUTH.bearer_header


class BridgeAuthTests(unittest.TestCase):
    def test_accepts_exact_bearer_token(self) -> None:
        self.assertIsNone(authorization_error("Bearer shared-secret", "shared-secret"))

    def test_rejects_missing_header(self) -> None:
        self.assertEqual(
            authorization_error("", "shared-secret"),
            (401, "Authorization header is required."),
        )

    def test_rejects_wrong_token(self) -> None:
        self.assertEqual(
            authorization_error("Bearer wrong", "shared-secret"),
            (403, "Authorization token is invalid."),
        )

    def test_fails_closed_without_server_token(self) -> None:
        self.assertEqual(
            authorization_error("Bearer anything", ""),
            (503, "AI VTuber bridge token is not configured."),
        )

    def test_builds_trusted_sidecar_header(self) -> None:
        self.assertEqual(bearer_header(" shared-secret "), "Bearer shared-secret")


if __name__ == "__main__":
    unittest.main()
