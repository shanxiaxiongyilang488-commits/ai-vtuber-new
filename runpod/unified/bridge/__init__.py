"""ComfyUI routes that proxy AI VTuber requests to private Pod sidecars."""

from __future__ import annotations

import os

from aiohttp import ClientSession, ClientTimeout, web
from server import PromptServer

from .auth import authorization_error, bearer_header


TIMEOUT = ClientTimeout(total=float(os.getenv("AI_VTUBER_PROXY_TIMEOUT", "10830")))
VOICE = "http://127.0.0.1:8791"
VIDEO = "http://127.0.0.1:8792"


def _token() -> str:
    return os.getenv("AI_VTUBER_BRIDGE_TOKEN", "").strip()


def _headers(request: web.Request, token: str) -> dict[str, str]:
    return {
        "Content-Type": request.headers.get("Content-Type", "application/json"),
        "Authorization": bearer_header(token),
    }


async def _proxy(request: web.Request, base: str, path: str) -> web.Response:
    token = _token()
    auth_error = authorization_error(request.headers.get("Authorization", ""), token)
    if auth_error is not None:
        status, detail = auth_error
        return web.json_response({"detail": detail}, status=status)

    body = await request.read() if request.method != "GET" else None
    async with ClientSession(timeout=TIMEOUT) as session:
        async with session.request(
            request.method,
            base + path,
            data=body,
            headers=_headers(request, token),
        ) as upstream:
            result = await upstream.read()
            response_headers = {}
            for name in ("Content-Type", "X-Duration"):
                if name in upstream.headers:
                    response_headers[name] = upstream.headers[name]
            return web.Response(
                body=result,
                status=upstream.status,
                headers=response_headers,
            )


routes = PromptServer.instance.routes


@routes.get("/ai-vtuber/voice/health")
async def voice_health(request: web.Request) -> web.Response:
    return await _proxy(request, VOICE, "/health")


@routes.post("/ai-vtuber/voice/run")
async def voice_run(request: web.Request) -> web.Response:
    return await _proxy(request, VOICE, "/run")


@routes.post("/ai-vtuber/voice/speak")
async def voice_speak(request: web.Request) -> web.Response:
    return await _proxy(request, VOICE, "/speak")


@routes.get("/ai-vtuber/video/health")
async def video_health(request: web.Request) -> web.Response:
    return await _proxy(request, VIDEO, "/health")


@routes.post("/ai-vtuber/video/run")
async def video_run(request: web.Request) -> web.Response:
    return await _proxy(request, VIDEO, "/run")


@routes.post("/ai-vtuber/video/jobs")
async def video_jobs(request: web.Request) -> web.Response:
    return await _proxy(request, VIDEO, "/jobs")


@routes.get("/ai-vtuber/video/jobs/{job_id}")
async def video_job(request: web.Request) -> web.Response:
    return await _proxy(request, VIDEO, f"/jobs/{request.match_info['job_id']}")


# ComfyUI imports this directory as a custom-node package.  The integration is
# route-only, but exporting empty node maps keeps the loader from treating the
# package as an invalid node extension.
NODE_CLASS_MAPPINGS: dict[str, type] = {}
NODE_DISPLAY_NAME_MAPPINGS: dict[str, str] = {}
