import base64
import importlib.util
import unittest
from pathlib import Path


SPEC = importlib.util.spec_from_file_location("voice_handler", Path(__file__).with_name("handler.py"))
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class VoiceWorkerValidationTests(unittest.TestCase):
    def test_rejects_non_wav_reference(self):
        with self.assertRaisesRegex(ValueError, "WAV"):
            MODULE._decode_reference(base64.b64encode(b"not-wave").decode("ascii"))

    def test_accepts_minimal_wav_header(self):
        fake = b"RIFF" + b"\x00" * 4 + b"WAVE" + b"data"
        self.assertEqual(MODULE._decode_reference(base64.b64encode(fake).decode("ascii")), fake)

    def test_rejects_unknown_task_without_loading_model(self):
        with self.assertRaisesRegex(ValueError, "Unsupported task"):
            MODULE.handler({"input": {"task": "unknown"}})


if __name__ == "__main__":
    unittest.main()
