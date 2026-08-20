import importlib.util
import sys
import unittest
from pathlib import Path


VIDEO_DIR = Path(__file__).parent
HANDLER_SPEC = importlib.util.spec_from_file_location("video_handler", VIDEO_DIR / "handler.py")
HANDLER_MODULE = importlib.util.module_from_spec(HANDLER_SPEC)
assert HANDLER_SPEC and HANDLER_SPEC.loader
HANDLER_SPEC.loader.exec_module(HANDLER_MODULE)
sys.modules["video_handler"] = HANDLER_MODULE

ANIMA_SPEC = importlib.util.spec_from_file_location("anima", VIDEO_DIR / "anima.py")
ANIMA_MODULE = importlib.util.module_from_spec(ANIMA_SPEC)
assert ANIMA_SPEC and ANIMA_SPEC.loader
ANIMA_SPEC.loader.exec_module(ANIMA_MODULE)


class AnimaWorkflowTests(unittest.TestCase):
    def test_uses_4090_safe_dimensions(self):
        self.assertEqual(ANIMA_MODULE.dimensions_for_size("1024x1024"), (1024, 1024))
        self.assertEqual(ANIMA_MODULE.dimensions_for_size("1024x1536"), (832, 1216))
        self.assertEqual(ANIMA_MODULE.dimensions_for_size("1536x1024"), (1216, 832))

    def test_builds_official_anima_model_workflow(self):
        graph = ANIMA_MODULE.workflow(
            {"prompt": "anime manga illustration", "size": "1024x1536", "seed": 42},
            "image/test",
        )
        self.assertEqual(graph["1"]["inputs"]["unet_name"], "anima-base-v1.0.safetensors")
        self.assertEqual(graph["2"]["inputs"]["clip_name"], "qwen_3_06b_base.safetensors")
        self.assertEqual(graph["3"]["inputs"]["vae_name"], "qwen_image_vae.safetensors")
        self.assertEqual(graph["6"]["inputs"]["width"], 832)
        self.assertEqual(graph["6"]["inputs"]["height"], 1216)
        self.assertEqual(graph["7"]["inputs"]["seed"], 42)
        self.assertEqual(graph["9"]["class_type"], "SaveImage")

    def test_requires_prompt_before_accessing_comfyui(self):
        with self.assertRaisesRegex(ValueError, "prompt is required"):
            ANIMA_MODULE.generate({})


if __name__ == "__main__":
    unittest.main()
