import base64
import importlib.util
import unittest
from pathlib import Path


SPEC = importlib.util.spec_from_file_location("video_handler", Path(__file__).with_name("handler.py"))
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class VideoWorkerValidationTests(unittest.TestCase):
    def test_docker_runtime_matches_h3_int8_backend(self):
        dockerfile = Path(__file__).with_name("Dockerfile").read_text("utf-8")
        self.assertIn("pytorch/pytorch:2.9.1-cuda13.0-cudnn9-runtime", dockerfile)
        self.assertIn("ARG COMFYUI_REF=v0.33.0", dockerfile)

    def test_builds_native_minimax_music3_workflow(self):
        graph = MODULE._music_workflow(
            {
                "caption": "cinematic science-fiction ambient",
                "lyrics": "[Instrumental]",
                "duration": 30,
                "seed": 42,
            },
            "audio/test",
        )
        self.assertEqual(graph["4"]["class_type"], "MiniMaxMusic3TextEncode")
        self.assertEqual(graph["5"]["class_type"], "ConditioningZeroOut")
        self.assertEqual(graph["6"]["class_type"], "EmptyMiniMaxMusic3LatentAudio")
        self.assertEqual(graph["10"]["class_type"], "SaveAudioMP3")
        self.assertEqual(graph["1"]["inputs"]["unet_name"], "minimax_music3_dit_int8_convrot.safetensors")

    def test_duration_snaps_to_h3_grid(self):
        self.assertEqual(MODULE.duration_to_frames(5), 124)
        self.assertEqual(MODULE.duration_to_frames(0), 39)
        self.assertEqual(MODULE.duration_to_frames(15), 362)
        self.assertEqual(MODULE.duration_to_frames(7) % 17, 5)

    def test_ratios_are_multiple_of_32(self):
        for ratio in ("16:9", "9:16", "1:1", "4:3", "3:4"):
            width, height = MODULE.dimensions_for_ratio(ratio)
            self.assertEqual(width % 32, 0)
            self.assertEqual(height % 32, 0)

    def test_decodes_image_data_url(self):
        payload = b"fake-png"
        decoded, extension = MODULE._decode_image(
            "data:image/png;base64," + base64.b64encode(payload).decode("ascii")
        )
        self.assertEqual(decoded, payload)
        self.assertEqual(extension, ".png")

    def test_builds_reference_workflow_for_multiple_images(self):
        graph = MODULE._workflow(
            {"prompt": "Use <Picture 1> and <Picture 2>.", "duration": 5, "mode": "r2v"},
            ["one.png", "two.png"],
            "video/test",
        )
        self.assertEqual(graph["10"]["class_type"], "MiniMaxH3ReferenceToVideo")
        self.assertIn("ref_images.ref_image_1", graph["10"]["inputs"])

    def test_rejects_unknown_task_without_gpu(self):
        with self.assertRaisesRegex(ValueError, "Unsupported task"):
            MODULE.handler({"input": {"task": "unknown"}})

    def test_formats_execution_error_without_large_input_dump(self):
        messages = [[
            "execution_error",
            {
                "node_id": "9",
                "node_type": "SamplerCustomAdvanced",
                "exception_type": "RuntimeError",
                "exception_message": "CUDA kernel failed",
                "traceback": ["line one", "line two"],
                "current_inputs": {"huge": "x" * 10000},
            },
        ]]
        formatted = MODULE._format_comfy_error(messages)
        self.assertIn("CUDA kernel failed", formatted)
        self.assertIn("SamplerCustomAdvanced", formatted)
        self.assertNotIn("current_inputs", formatted)
        self.assertLess(len(formatted), 1000)

    def test_diagnostics_task_does_not_start_comfy(self):
        result = MODULE.handler({"input": {"task": "video.diagnostics"}})
        self.assertTrue(result["ready"])
        self.assertIn("torch", result["runtime"])


if __name__ == "__main__":
    unittest.main()
