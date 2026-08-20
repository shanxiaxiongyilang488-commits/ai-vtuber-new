"""Static regression checks for the unified RunPod entrypoint."""

from __future__ import annotations

import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parent


class UnifiedEntrypointContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.entrypoint = (ROOT / "entrypoint.sh").read_text(encoding="utf-8")
        self.dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")

    def test_all_bridge_python_modules_are_installed(self) -> None:
        self.assertIn(
            'cp -f /opt/ai-vtuber/bridge/*.py \\\n'
            '  "$COMFY_DATA/custom_nodes/ai_vtuber_bridge/"',
            self.entrypoint,
        )

    def test_bridge_auth_module_exists(self) -> None:
        self.assertTrue((ROOT / "bridge" / "auth.py").is_file())

    def test_python_dependencies_are_baked_into_the_image(self) -> None:
        self.assertIn("python -m pip install --no-cache-dir -r requirements.txt", self.dockerfile)
        self.assertIn('"sqlalchemy>=2,<3"', self.dockerfile)
        self.assertIn('"alembic>=1.14,<2"', self.dockerfile)
        self.assertIn('"tqdm>=4.67,<5"', self.dockerfile)

    def test_irodori_environment_is_baked_into_the_image(self) -> None:
        self.assertIn("git clone https://github.com/Aratako/Irodori-TTS.git", self.dockerfile)
        self.assertIn("uv sync --no-dev --extra cu128", self.dockerfile)

    def test_only_gateway_and_jupyter_are_public(self) -> None:
        self.assertIn("EXPOSE 8188 8888", self.dockerfile)
        self.assertNotIn("EXPOSE 8188 8791", self.dockerfile)
        self.assertIn("--host 127.0.0.1 --port 8791", self.entrypoint)
        self.assertIn("--host 127.0.0.1 --port 8792", self.entrypoint)

    def test_models_and_outputs_use_the_network_volume(self) -> None:
        self.assertIn("H3_MODEL_ROOT=/workspace/ComfyUI/models", self.dockerfile)
        self.assertIn("for directory in models input output user custom_nodes", self.entrypoint)


if __name__ == "__main__":
    unittest.main()
