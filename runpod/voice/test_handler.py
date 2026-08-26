import base64
import importlib.util
import math
import os
import tempfile
import unittest
import wave
from array import array
from pathlib import Path
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("voice_handler", Path(__file__).with_name("handler.py"))
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class VoiceWorkerValidationTests(unittest.TestCase):
    def _write_pcm16(self, path: Path, samples: list[int], sample_rate: int = 16000):
        pcm = array("h", samples)
        with wave.open(str(path), "wb") as writer:
            writer.setnchannels(1)
            writer.setsampwidth(2)
            writer.setframerate(sample_rate)
            writer.writeframes(pcm.tobytes())

    def test_rejects_non_wav_reference(self):
        with self.assertRaisesRegex(ValueError, "WAV"):
            MODULE._decode_reference(base64.b64encode(b"not-wave").decode("ascii"))

    def test_accepts_minimal_wav_header(self):
        fake = b"RIFF" + b"\x00" * 4 + b"WAVE" + b"data"
        self.assertEqual(MODULE._decode_reference(base64.b64encode(fake).decode("ascii")), fake)

    def test_rejects_unknown_task_without_loading_model(self):
        with self.assertRaisesRegex(ValueError, "Unsupported task"):
            MODULE.handler({"input": {"task": "unknown"}})

    def test_accepts_full_and_quantized_hugging_face_model_ids(self):
        self.assertEqual(
            MODULE._normalize_model_id("Aratako/Irodori-TTS-v4.1-Small"),
            "Aratako/Irodori-TTS-v4.1-Small",
        )
        self.assertEqual(
            MODULE._normalize_model_id("Aratako/Irodori-TTS-v4.1-Small-Quantized/int8-weight-only"),
            "Aratako/Irodori-TTS-v4.1-Small-Quantized/int8-weight-only",
        )

    def test_rejects_unsafe_model_id(self):
        with self.assertRaisesRegex(ValueError, "modelCheckpoint"):
            MODULE._normalize_model_id("../../bad model")

    def test_resolves_runpod_cached_model_without_network(self):
        with tempfile.TemporaryDirectory() as cache:
            revision = "abc123"
            repo = Path(cache) / "models--Aratako--Irodori-TTS-v4.1-Small"
            checkpoint = repo / "snapshots" / revision / "model.safetensors"
            checkpoint.parent.mkdir(parents=True)
            checkpoint.write_bytes(b"model")
            (repo / "refs").mkdir()
            (repo / "refs" / "main").write_text(revision, encoding="utf-8")

            resolved = MODULE._cached_checkpoint_path(
                "Aratako/Irodori-TTS-v4.1-Small",
                cache,
            )
            self.assertTrue(Path(resolved).samefile(checkpoint))

    def test_resolves_cached_quantized_subfolder(self):
        with tempfile.TemporaryDirectory() as cache:
            checkpoint = (
                Path(cache)
                / "models--Aratako--Irodori-TTS-v4.1-Small-Quantized"
                / "snapshots"
                / "def456"
                / "int8-weight-only"
                / "model.safetensors"
            )
            checkpoint.parent.mkdir(parents=True)
            checkpoint.write_bytes(b"model")
            self.assertEqual(
                MODULE._cached_checkpoint_path(
                    "Aratako/Irodori-TTS-v4.1-Small-Quantized/int8-weight-only",
                    cache,
                ),
                str(checkpoint.resolve()),
            )

    def test_resolves_official_runpod_cache_when_legacy_env_is_configured(self):
        with tempfile.TemporaryDirectory() as mounted_volume:
            official_cache = Path(mounted_volume) / "huggingface-cache" / "hub"
            checkpoint = (
                official_cache
                / "models--Aratako--Irodori-TTS-v4.1-Small"
                / "snapshots"
                / "runpod123"
                / "model.safetensors"
            )
            checkpoint.parent.mkdir(parents=True)
            checkpoint.write_bytes(b"model")
            legacy_cache = Path(mounted_volume) / "huggingface" / "hub"

            with patch.dict(
                os.environ,
                {
                    "HUGGINGFACE_HUB_CACHE": str(legacy_cache),
                    "HF_HOME": "",
                    "RUNPOD_MODEL_CACHE_ROOT": str(official_cache),
                },
            ):
                self.assertEqual(
                    MODULE._cached_checkpoint_path("Aratako/Irodori-TTS-v4.1-Small"),
                    str(checkpoint.resolve()),
                )

    def test_matches_lowercase_runpod_cache_directory(self):
        with tempfile.TemporaryDirectory() as cache:
            checkpoint = (
                Path(cache)
                / "models--aratako--irodori-tts-v4.1-small"
                / "snapshots"
                / "lowercase123"
                / "model.safetensors"
            )
            checkpoint.parent.mkdir(parents=True)
            checkpoint.write_bytes(b"model")

            resolved = MODULE._cached_checkpoint_path(
                "Aratako/Irodori-TTS-v4.1-Small",
                cache,
            )
            self.assertTrue(Path(resolved).samefile(checkpoint))

    def test_tail_cleanup_removes_sound_after_terminal_pause(self):
        sample_rate = 16000
        speech = [int(6000 * math.sin(2 * math.pi * 220 * index / sample_rate)) for index in range(sample_rate)]
        silence = [0] * int(sample_rate * 0.30)
        artifact = [int(3500 * math.sin(2 * math.pi * 70 * index / sample_rate)) for index in range(int(sample_rate * 0.20))]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tail.wav"
            self._write_pcm16(path, speech + silence + artifact, sample_rate)
            result = MODULE._clean_wav_tail(str(path), "短い発話です。")
            self.assertTrue(result["changed"])
            self.assertGreater(result["trimmed_seconds"], 0.35)
            with wave.open(str(path), "rb") as reader:
                self.assertLess(reader.getnframes() / sample_rate, 1.15)

    def test_tail_cleanup_fades_abrupt_last_sample_to_zero(self):
        sample_rate = 16000
        samples = [4000] * int(sample_rate * 0.5)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "click.wav"
            self._write_pcm16(path, samples, sample_rate)
            MODULE._clean_wav_tail(str(path), "確認します。")
            with wave.open(str(path), "rb") as reader:
                reader.setpos(reader.getnframes() - int(sample_rate * 0.01))
                tail = array("h")
                tail.frombytes(reader.readframes(int(sample_rate * 0.01)))
            self.assertTrue(tail)
            self.assertEqual(max(abs(sample) for sample in tail), 0)


if __name__ == "__main__":
    unittest.main()
