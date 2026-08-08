"""RunPod Serverless worker for deep character-chat generation.

The worker keeps one Hugging Face causal language model in memory per warm
worker. It returns only the final character reply; hidden reasoning is removed.
"""

from __future__ import annotations

import os
import re
import threading
from pathlib import Path
from typing import Any


MODEL_ID = os.environ.get("MODEL_ID", "Qwen/Qwen3-8B").strip()
MODEL_REVISION = os.environ.get("MODEL_REVISION", "main").strip()
MODEL_CACHE = Path(os.environ.get("MODEL_CACHE", "/runpod-volume/huggingface"))
MAX_INPUT_CHARS = int(os.environ.get("MAX_INPUT_CHARS", "60000"))
MAX_CONTEXT_TOKENS = int(os.environ.get("MAX_CONTEXT_TOKENS", "24576"))

_model: Any = None
_tokenizer: Any = None
_load_lock = threading.Lock()


def _text(value: Any, limit: int) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def _number(value: Any, fallback: float, minimum: float, maximum: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    return max(minimum, min(maximum, parsed))


def _history(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    result: list[dict[str, str]] = []
    budget = 20000
    for item in reversed(value[-30:]):
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        if role not in ("user", "assistant"):
            continue
        content = _text(item.get("content", item.get("text")), 8000)
        if not content:
            continue
        if len(content) > budget:
            content = content[-budget:]
        result.append({"role": role, "content": content})
        budget -= len(content)
        if budget <= 0:
            break
    result.reverse()
    return result


def _load_model() -> tuple[Any, Any]:
    global _model, _tokenizer
    if _model is not None and _tokenizer is not None:
        return _model, _tokenizer
    with _load_lock:
        if _model is not None and _tokenizer is not None:
            return _model, _tokenizer
        from transformers import AutoModelForCausalLM, AutoTokenizer

        MODEL_CACHE.mkdir(parents=True, exist_ok=True)
        token = os.environ.get("HF_TOKEN") or None
        _tokenizer = AutoTokenizer.from_pretrained(
            MODEL_ID,
            revision=MODEL_REVISION,
            cache_dir=str(MODEL_CACHE),
            token=token,
            trust_remote_code=False,
        )
        _model = AutoModelForCausalLM.from_pretrained(
            MODEL_ID,
            revision=MODEL_REVISION,
            cache_dir=str(MODEL_CACHE),
            token=token,
            torch_dtype="auto",
            device_map="auto",
            low_cpu_mem_usage=True,
            trust_remote_code=False,
        )
        _model.eval()
    return _model, _tokenizer


def _strip_hidden_reasoning(text: str) -> str:
    cleaned = re.sub(r"<think(?:ing)?>[\s\S]*?</think(?:ing)?>", "", text, flags=re.I)
    cleaned = re.sub(r"^\s*(?:analysis|reasoning)\s*:\s*.*$", "", cleaned, flags=re.I | re.M)
    return cleaned.strip()


def _generate_text(messages: list[dict[str, str]], max_tokens: int, temperature: float) -> str:
    model, tokenizer = _load_model()
    template_options = {
        "tokenize": False,
        "add_generation_prompt": True,
    }
    try:
        prompt = tokenizer.apply_chat_template(messages, enable_thinking=False, **template_options)
    except TypeError:
        prompt = tokenizer.apply_chat_template(messages, **template_options)
    encoded = tokenizer(
        prompt,
        return_tensors="pt",
        truncation=True,
        max_length=MAX_CONTEXT_TOKENS,
    )
    device = next(model.parameters()).device
    encoded = {key: value.to(device) for key, value in encoded.items()}
    output = model.generate(
        **encoded,
        max_new_tokens=max_tokens,
        do_sample=temperature > 0.01,
        temperature=max(temperature, 0.01),
        top_p=0.92,
        repetition_penalty=1.05,
        pad_token_id=tokenizer.eos_token_id,
    )
    generated = output[0][encoded["input_ids"].shape[-1]:]
    return tokenizer.decode(generated, skip_special_tokens=True)


def generate(data: dict[str, Any]) -> dict[str, Any]:
    system_prompt = _text(data.get("systemPrompt"), min(MAX_INPUT_CHARS, 40000))
    user_message = _text(data.get("userMessage"), 12000)
    if not system_prompt:
        raise ValueError("reflection.generate requires systemPrompt.")
    if not user_message:
        raise ValueError("reflection.generate requires userMessage.")
    history = _history(data.get("conversationHistory"))
    if history and history[-1]["role"] == "user" and history[-1]["content"] == user_message:
        history.pop()
    messages = [
        {
            "role": "system",
            "content": system_prompt
            + "\n\nReturn only the character's final reply. Never reveal hidden reasoning, analysis, or chain-of-thought.",
        },
        *history,
        {"role": "user", "content": user_message},
    ]
    max_tokens = int(_number(data.get("maxTokens"), 2048, 128, 4096))
    temperature = _number(data.get("temperature"), 0.75, 0.0, 1.5)
    answer = _strip_hidden_reasoning(_generate_text(messages, max_tokens, temperature))
    if not answer:
        raise RuntimeError("Deep model returned an empty final reply.")
    return {"text": answer, "model": MODEL_ID, "backend": "runpod-reflection"}


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data = job.get("input")
    if not isinstance(data, dict):
        raise ValueError("job.input must be an object.")
    task = data.get("task")
    if task == "reflection.warmup":
        _load_model()
        return {"ready": True, "model": MODEL_ID}
    if task == "reflection.generate":
        return generate(data)
    raise ValueError(f"Unsupported task: {task!r}")


if __name__ == "__main__":
    import runpod

    runpod.serverless.start({"handler": handler})
