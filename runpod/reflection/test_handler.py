import importlib.util
import unittest
from pathlib import Path


SPEC = importlib.util.spec_from_file_location("reflection_handler", Path(__file__).with_name("handler.py"))
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class ReflectionHandlerContractTests(unittest.TestCase):
    def test_rejects_unknown_task_without_loading_model(self):
        with self.assertRaisesRegex(ValueError, "Unsupported task"):
            MODULE.handler({"input": {"task": "unknown"}})

    def test_generate_returns_only_clean_final_text(self):
        original = MODULE._generate_text
        MODULE._generate_text = lambda messages, max_tokens, temperature: "<think>private analysis</think>\n縺薙ｌ縺悟屓遲斐〒縺吶・"
        try:
            result = MODULE.handler({
                "input": {
                    "task": "reflection.generate",
                    "systemPrompt": "Character prompt",
                    "userMessage": "Question",
                    "conversationHistory": [{"role": "assistant", "text": "Earlier"}],
                }
            })
        finally:
            MODULE._generate_text = original
        self.assertNotIn("private analysis", result["text"])
        self.assertEqual(result["backend"], "runpod-reflection")

    def test_requires_prompts_before_loading_model(self):
        with self.assertRaisesRegex(ValueError, "systemPrompt"):
            MODULE.handler({"input": {"task": "reflection.generate", "userMessage": "Question"}})


if __name__ == "__main__":
    unittest.main()
