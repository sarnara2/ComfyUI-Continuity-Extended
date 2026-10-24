"""The optional, isolated PreStage sheet tool's local API."""

import asyncio
import ipaddress
import json
import subprocess

from aiohttp import web
from server import PromptServer

from .. import jobs, sheet
from ..guard import same_origin

_chooser = asyncio.Lock()


def _builder_routes():
    routes = {(route.method, route.path) for route in PromptServer.instance.routes}
    return ("GET", "/h3-character-sheet") in routes and ("POST", "/h3-character-sheet/action") in routes


@PromptServer.instance.routes.get("/continuity/sheet/capabilities")
async def capabilities(request):
    try:
        result = await asyncio.get_running_loop().run_in_executor(None, sheet.capabilities)
        if result["available"] and not _builder_routes():
            result.update(available=False, reason="builder_routes_missing")
        return web.json_response(result, headers={"Cache-Control": "no-store"})
    except (sheet.SheetError, KeyError, TypeError, AttributeError) as exc:
        return web.json_response({"installed": True, "available": False,
                                  "reason": "builder_incompatible", "error": str(exc)})


@PromptServer.instance.routes.post("/continuity/sheet/run")
@same_origin
async def run(request):
    try:
        body = await request.json()
        if not _builder_routes():
            raise sheet.SheetError("builder_routes_missing")
        graph, plan = await asyncio.get_running_loop().run_in_executor(None, sheet.build, body)
        prompt_id = await jobs.enqueue(graph, body.get("client_id"))
        return web.json_response({"prompt_id": prompt_id, **plan})
    except jobs.JobError as exc:
        return web.json_response({"error": str(exc)}, status=500)
    except (json.JSONDecodeError, sheet.SheetError, ValueError, TypeError, KeyError) as exc:
        return web.json_response({"error": str(exc)}, status=400)


@PromptServer.instance.routes.post("/continuity/sheet/export")
@same_origin
async def export(request):
    try:
        peer = ipaddress.ip_address(request.remote or "")
        local = peer.is_loopback or (isinstance(peer, ipaddress.IPv6Address) and
                                    bool(peer.ipv4_mapped and peer.ipv4_mapped.is_loopback))
    except ValueError:
        local = False
    if not local:
        return web.json_response({"error": "open ComfyUI on localhost to save on this machine"}, status=403)
    try:
        body = await request.json()
        loop = asyncio.get_running_loop()
        source = await loop.run_in_executor(None, sheet.export_source, body)
        title = body.get("title", "Save sheet PNG")
        if not isinstance(title, str):
            raise sheet.SheetError("the dialog title must be text")
        async with _chooser:
            destination = await loop.run_in_executor(None, sheet.choose_save, source.name, title)
        if destination is None:
            return web.json_response({"cancelled": True})
        # The source may have been recomposed while the native dialog was open.
        source = await loop.run_in_executor(None, sheet.export_source, body)
        return web.json_response(await loop.run_in_executor(None, sheet.export_copy, source, destination))
    except (json.JSONDecodeError, sheet.SheetError, OSError, subprocess.TimeoutExpired, ValueError, TypeError) as exc:
        return web.json_response({"error": str(exc)}, status=400)
