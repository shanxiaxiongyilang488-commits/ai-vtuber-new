import base64
import io
from pathlib import Path
import queue
import sys
import unittest
from unittest.mock import patch
import wave

sys.path.insert(0, str(Path(__file__).parent))
import speech_cpp_handler as worker


def wav():
    output = io.BytesIO()
    with wave.open(output, "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(48000)
        writer.writeframes(b"\x00\x00" * 100)
    return output.getvalue()


class FakeInput:
    def __init__(self, runtime, messages):
        self.runtime = runtime
        self.messages = messages
    def write(self, line):
        import json
        request = json.loads(line)
        for message in self.messages:
            self.runtime.messages.put({**message, "id": request["id"]})
    def flush(self):
        pass


def protocol(messages):
    runtime = worker.Runtime.__new__(worker.Runtime)
    runtime.messages = queue.Queue()
    runtime.process = type("Process", (), {"stdin": FakeInput(runtime, messages)})()
    return runtime


class Contracts(unittest.TestCase):
    def test_large_and_unknown_models_fail_before_start(self):
        for model in ["Aratako/Irodori-TTS-v4-Large", "../../outside", "Aratako/Irodori-TTS-v4.1-Small"]:
            with self.assertRaises(ValueError):
                worker.select_model(model)
        self.assertEqual(worker.select_model(next(iter(worker.MODELS))), "irodori-tts")

    def test_gpu_is_required_and_device_name_is_retained(self):
        self.assertEqual(worker.discrete_device("Vulkan0    dgpu  NVIDIA GeForce RTX 5090, 32 GB"),
                         ("Vulkan0", "NVIDIA GeForce RTX 5090, 32 GB"))
        for devices in ["CPU cpu Intel", "Vulkan0 igpu Intel", ""]:
            with self.assertRaises(RuntimeError):
                worker.discrete_device(devices)

    def test_clone_requires_valid_wav_and_design_does_not(self):
        self.assertEqual(worker.reference_bytes(base64.b64encode(wav()).decode()), wav())
        for audio in [None, "bad!", base64.b64encode(b"RIFF-not-a-wave").decode()]:
            with self.assertRaises(ValueError):
                worker.reference_bytes(audio)
        valid = worker.validate_speech({"text": "こんにちは", "voice": {"mode": "design"}})
        self.assertIsNone(valid[4])
        with self.assertRaises(ValueError):
            worker.validate_speech({"text": "こんにちは", "voice": {"mode": "clone"}})

    def test_bad_voice_input_never_loads_gpu(self):
        for voice in [{"speed": float("nan")}, {"speed": 3}, {"mode": "lora"}]:
            with patch.object(worker, "get_runtime") as start:
                with self.assertRaises(ValueError):
                    worker.handler({"input": {"task": "voice.speak", "text": "こんにちは", "voice": voice}})
                start.assert_not_called()
        caption = worker.validate_speech({"text": "確認", "voice": {"caption": "自然な日本語。" * 100}})[2]
        self.assertLessEqual(len(caption.encode()), 384)

    def test_python_caption_preamble_keeps_the_actual_voice_description(self):
        caption = "EXACT TEXT SPEECH — HIGHEST PRIORITY. " + "Read supplied text only. " * 30 + "\n\nVOICE DESIGN: 明るく自然な声。"
        instructions = worker.validate_speech({"text": "確認", "voice": {"caption": caption}})[2]
        self.assertEqual(instructions, "明るく自然な声。")

    def test_complete_pcm_and_progress_are_reassembled(self):
        runtime = protocol([{"type": "progress", "done": .5},
                            {"type": "chunk", "seq": 0, "pcm": base64.b64encode(b"\x01\x00").decode()},
                            {"type": "end", "stop": "complete", "samples": 1, "seed": 7}])
        pcm, terminal = runtime.request({"type": "synthesize", "text": "test"}, audio=True)
        self.assertEqual(pcm, b"\x01\x00")
        self.assertEqual(terminal["seed"], 7)

    def test_truncated_duplicate_or_empty_speech_is_rejected(self):
        for messages in [[{"type": "end", "stop": "complete", "samples": 0}],
                         [{"type": "chunk", "seq": 1, "pcm": "AAA="}],
                         [{"type": "chunk", "seq": 0, "pcm": "AAA="},
                          {"type": "end", "stop": "model_limit", "samples": 1}],
                         [{"type": "chunk", "seq": 0, "pcm": "AAA="},
                          {"type": "end", "stop": "complete", "samples": 2}]]:
            with self.assertRaises(RuntimeError):
                protocol(messages).request({"type": "synthesize", "text": "test"}, audio=True)

    def test_registered_voice_and_transport_metadata_survive(self):
        class FakeRuntime:
            device = "Vulkan0"
            device_name = "NVIDIA RTX 5090"
            sample_rate = 48000
            def add_voice(self, reference):
                self.reference = reference
                return "saved-voice"
            def request(self, request, audio=False):
                self.request_body = request
                return b"\x01\x00" * 48000, {"seed": 9}
        runtime = FakeRuntime()
        with patch.object(worker, "get_runtime", return_value=runtime):
            result = worker.handler({"input": {"task": "voice.speak", "text": "こんにちは", "seed": 9,
                                    "voice": {"mode": "clone", "caption": "明るい声", "speed": 1.1},
                                    "referenceAudioBase64": base64.b64encode(wav()).decode()}})
        self.assertEqual(runtime.request_body["voice"], "saved-voice")
        self.assertEqual(runtime.reference, wav())
        self.assertEqual(runtime.request_body["speed"], 1.1)
        self.assertEqual(result["engine"], "speech.cpp")
        self.assertEqual(result["source_revision"], "0.8.6")
        with wave.open(io.BytesIO(base64.b64decode(result["audio_base64"])), "rb") as audio:
            self.assertEqual(audio.getnframes(), 48000)
        self.assertEqual(result["duration"], 1)


if __name__ == "__main__":
    unittest.main()
