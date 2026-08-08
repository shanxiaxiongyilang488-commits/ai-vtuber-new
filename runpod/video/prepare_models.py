"""Prepare HunyuanVideo-1.5 checkpoints on a mounted RunPod Network Volume."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any


MODEL_PATH = Path(os.getenv("HUNYUAN_MODEL_PATH", "/runpod-volume/models/HunyuanVideo-1.5"))


def prepare_models(include_i2v: bool = True) -> dict[str, Any]:
    from huggingface_hub import snapshot_download

    token = os.getenv("HF_TOKEN") or None
    MODEL_PATH.mkdir(parents=True, exist_ok=True)
    transformer_patterns = [
        "*.json",
        "vae/**",
        "scheduler/**",
        "transformer/480p_t2v/**",
    ]
    if include_i2v:
        transformer_patterns.append("transformer/480p_i2v_step_distilled/**")
    snapshot_download(
        "tencent/HunyuanVideo-1.5",
        local_dir=MODEL_PATH,
        allow_patterns=transformer_patterns,
        token=token,
    )
    snapshot_download(
        "Qwen/Qwen2.5-VL-7B-Instruct",
        local_dir=MODEL_PATH / "text_encoder" / "llm",
        token=token,
    )
    snapshot_download(
        "google/byt5-small",
        local_dir=MODEL_PATH / "text_encoder" / "byt5-small",
        token=token,
    )
    from modelscope.hub.snapshot_download import snapshot_download as modelscope_download

    modelscope_download(
        "AI-ModelScope/Glyph-SDXL-v2",
        local_dir=str(MODEL_PATH / "text_encoder" / "Glyph-SDXL-v2"),
    )
    if include_i2v:
        if not token:
            raise RuntimeError(
                "HF_TOKEN is required for the gated black-forest-labs/FLUX.1-Redux-dev vision encoder."
            )
        snapshot_download(
            "black-forest-labs/FLUX.1-Redux-dev",
            local_dir=MODEL_PATH / "vision_encoder" / "siglip",
            token=token,
        )
    return {"prepared": True, "path": str(MODEL_PATH), "includeI2v": include_i2v}


if __name__ == "__main__":
    print(prepare_models(include_i2v=os.getenv("INCLUDE_I2V", "1") == "1"))
