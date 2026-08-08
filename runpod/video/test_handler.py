import base64
import importlib.util
import unittest
from pathlib import Path


SPEC = importlib.util.spec_from_file_location("video_handler", Path(__file__).with_name("handler.py"))
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class VideoWorkerValidationTests(unittest.TestCase):
    def test_duration_is_clamped_and_four_n_plus_one(self):
        self.assertEqual(MODULE.duration_to_frames(5), 121)
        self.assertEqual(MODULE.duration_to_frames(0), 25)
        self.assertEqual(MODULE.duration_to_frames(100), 361)
        self.assertEqual((MODULE.duration_to_frames(7) - 1) % 4, 0)

    def test_decodes_image_data_url(self):
        payload = b"fake-png"
        decoded, extension = MODULE._decode_data_image(
            "data:image/png;base64," + base64.b64encode(payload).decode("ascii")
        )
        self.assertEqual(decoded, payload)
        self.assertEqual(extension, ".png")

    def test_rejects_unknown_task_without_gpu(self):
        with self.assertRaisesRegex(ValueError, "Unsupported task"):
            MODULE.handler({"input": {"task": "unknown"}})


if __name__ == "__main__":
    unittest.main()
