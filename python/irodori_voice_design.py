import json
import os
import runpy
import sys


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def fail(message: str, status: int = 1) -> None:
    print(json.dumps({"error": message}, ensure_ascii=False), file=sys.stderr)
    raise SystemExit(status)


def clean_text(value: object) -> str:
    return str(value or "").encode("utf-8", errors="replace").decode("utf-8", errors="replace").strip()


def clean_int(value: object, default: int | None = None) -> int | None:
    text = clean_text(value)
    if not text:
        return default
    try:
        return int(text)
    except ValueError:
        fail(f"invalid integer: {text}")


def clean_float(value: object) -> float:
    text = clean_text(value)
    if not text:
        fail("seconds is required")
    try:
        return float(text)
    except ValueError:
        fail(f"invalid seconds: {text}")


def main() -> None:
    if len(sys.argv) < 3:
        fail("Usage: irodori_voice_design.py <input-json> <output-wav>")

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    try:
        with open(input_path, "r", encoding="utf-8", errors="replace") as f:
            req = json.load(f)
    except json.JSONDecodeError:
        fail("Invalid JSON")
    except OSError as exc:
        fail(f"Failed to read input JSON: {exc}")

    irodori_root = clean_text(req.get("irodoriRoot"))
    checkpoint = clean_text(req.get("checkpoint"))
    text = clean_text(req.get("text"))
    caption = clean_text(req.get("caption"))
    seconds = clean_float(req.get("seconds"))
    steps = clean_int(req.get("steps"), 20)
    seed = clean_int(req.get("seed"), None)

    if not irodori_root:
        fail("irodoriRoot is required")
    if not checkpoint:
        fail("checkpoint is required")
    if not text:
        fail("text is required")
    if not caption:
        fail("caption is required")
    if seconds <= 0:
        fail("seconds must be greater than 0")
    if steps is None or steps <= 0:
        fail("steps must be greater than 0")

    infer_path = os.path.join(irodori_root, "infer.py")
    if not os.path.exists(infer_path):
        fail(f"infer.py not found: {infer_path}")

    os.chdir(irodori_root)
    sys.modules.pop("irodori_tts", None)
    sys.path = [
        irodori_root,
        *[
            item
            for item in sys.path
            if os.path.abspath(item or os.getcwd()) != os.path.abspath(os.path.dirname(__file__))
            and os.path.abspath(item or os.getcwd()) != os.path.abspath(irodori_root)
        ],
    ]
    argv = [
        infer_path,
        "--hf-checkpoint",
        checkpoint,
        "--text",
        text,
        "--caption",
        caption,
        "--no-ref",
        "--seconds",
        str(seconds),
        "--num-steps",
        str(steps),
        "--output-wav",
        output_path,
        "--no-show-timings",
    ]
    if seed is not None:
        argv.extend(["--seed", str(seed)])

    sys.argv = argv
    runpy.run_path(infer_path, run_name="__main__")


if __name__ == "__main__":
    main()
