import json
import os
import sys
import urllib.error
import urllib.request


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def fail(message: str, status: int = 1) -> None:
    print(json.dumps({"error": message}, ensure_ascii=False), file=sys.stderr)
    raise SystemExit(status)


def clean_text(value: object) -> str:
    text = str(value or "")
    return text.encode("utf-8", errors="replace").decode("utf-8", errors="replace").strip()


def main() -> None:
    if len(sys.argv) < 3:
        fail("Usage: irodori_tts.py <input-json> <output-wav>")

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    try:
        with open(input_path, "r", encoding="utf-8", errors="replace") as f:
            req = json.load(f)
    except json.JSONDecodeError:
        fail("Invalid JSON")
    except OSError as exc:
        fail(f"Failed to read input JSON: {exc}")

    text = clean_text(req.get("text"))
    if not text:
        fail("text is required")

    base_url = (os.environ.get("IRODORI_TTS_URL") or "http://localhost:8088").rstrip("/")
    model = os.environ.get("IRODORI_TTS_MODEL") or "irodori-tts"
    voice = clean_text(req.get("voice") or os.environ.get("IRODORI_TTS_VOICE") or "none")
    response_format = clean_text(req.get("response_format") or "wav")

    payload = {
        "model": model,
        "input": text,
        "voice": voice,
        "response_format": response_format,
    }

    data = json.dumps(payload, ensure_ascii=False).encode("utf-8", errors="replace")
    headers = {
        "Content-Type": "application/json",
        "Accept": "audio/wav",
    }

    api_key = os.environ.get("IRODORI_TTS_API_KEY") or os.environ.get("IRODORI_API_KEY")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    request = urllib.request.Request(
        f"{base_url}/v1/audio/speech",
        data=data,
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            audio = response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        fail(f"Irodori-TTS HTTP {exc.code}: {detail}")
    except urllib.error.URLError as exc:
        fail(f"Irodori-TTS connection failed: {exc.reason}")
    except TimeoutError:
        fail("Irodori-TTS request timed out")

    if not audio:
        fail("Irodori-TTS returned empty audio")

    try:
        with open(output_path, "wb") as f:
            f.write(audio)
    except OSError as exc:
        fail(f"Failed to write wav output: {exc}")

    print(json.dumps({"ok": True, "output": output_path}, ensure_ascii=False))


if __name__ == "__main__":
    main()
