"""Local folder grants for the shared picker; original files stay read-only."""

import asyncio
import functools
import ipaddress
import subprocess

from aiohttp import web
from server import PromptServer

import folder_paths

from .. import assets, folders, preview, refmod, server_routes
from ..guard import same_origin, _same_origin

_chooser = asyncio.Lock()
_registry_writes = asyncio.Lock()


def _registry(request, view=False):
    # Media elements cannot send the frontend's comfy-user header. The folder
    # listing supplies its user id; the random folder grant is still required.
    if view and request.query.get("user"):
        request = request.clone(headers={**request.headers, "comfy-user": request.query["user"]})
    path = PromptServer.instance.user_manager.get_request_user_filepath(request, folders.FILE, create_dir=False)
    if path is None:
        raise folders.FolderError("no folder storage for this user")
    return path


async def _json_work(function, *args):
    try:
        body = await asyncio.get_running_loop().run_in_executor(None, function, *args)
        return web.json_response(body, headers={"Cache-Control": "no-store"})
    except (folders.FolderError, refmod.RefModError, OSError) as exc:
        return web.json_response({"error": str(exc)}, status=400)


def _media_origin(handler):
    @functools.wraps(handler)
    async def guarded(request):
        origin = request.headers.get("Origin")
        if request.headers.get("Sec-Fetch-Site") not in (None, "same-origin", "none") or (
                origin is not None and not _same_origin(origin, request.headers.get("Host", ""))):
            return web.json_response({"error": "that request came from another site"}, status=403)
        try:
            return await handler(request)
        except (folders.FolderError, refmod.RefModError, OSError, KeyError) as exc:
            return web.json_response({"error": str(exc)}, status=404)
    return guarded


@PromptServer.instance.routes.post("/continuity/folders/list")
@same_origin
async def list_folders(request):
    filename = _registry(request)
    user = PromptServer.instance.user_manager.get_request_user_id(request)
    return await _json_work(lambda: {"folders": folders.load(filename), "user": user})


@PromptServer.instance.routes.post("/continuity/folders/choose")
@same_origin
async def choose_folder(request):
    try:
        peer = ipaddress.ip_address(request.remote or "")
        local = peer.is_loopback or bool(getattr(peer, "ipv4_mapped", None) and peer.ipv4_mapped.is_loopback)
    except ValueError:
        local = False
    if not local:
        return web.json_response({"error": "open ComfyUI on localhost to choose a folder on this machine"}, status=403)
    try:
        async with _chooser:
            chosen = await asyncio.get_running_loop().run_in_executor(None, folders.choose)
        if chosen is None:
            return web.json_response({"folder": None})
        filename = _registry(request)
        async with _registry_writes:
            return await _json_work(lambda: {"folder": folders.register(filename, chosen)})
    except (folders.FolderError, OSError, subprocess.TimeoutExpired) as exc:
        return web.json_response({"error": str(exc)}, status=400)


@PromptServer.instance.routes.post("/continuity/folders/remove")
@same_origin
async def remove_folder(request):
    body = await request.json()
    filename = _registry(request)
    async with _registry_writes:
        return await _json_work(lambda: (folders.remove(filename, body.get("folder")), {"removed": True})[1])


@PromptServer.instance.routes.post("/continuity/folders/assets")
@same_origin
async def folder_assets(request):
    body = await request.json()
    if not isinstance(body, dict):
        return web.json_response({"error": "send the selected folder as an object"}, status=400)
    if "directory" in body and not isinstance(body["directory"], str):
        return web.json_response({"error": "send a relative directory"}, status=400)
    return await _json_work(folders.listing, _registry(request), body.get("folder"), body.get("kind"),
                            body.get("directory"))


@PromptServer.instance.routes.post("/continuity/folders/metadata")
@same_origin
async def folder_metadata(request):
    body = await request.json()
    if not isinstance(body, dict):
        return web.json_response({"error": "send the registered file paths as an object"}, status=400)
    return await _json_work(folders.metadata, _registry(request), body.get("paths"), body.get("kind"))


@PromptServer.instance.routes.post("/continuity/folders/import")
@same_origin
async def import_assets(request):
    body = await request.json()
    picked = body.get("assets")
    if not isinstance(picked, list) or any(not isinstance(row, dict) for row in picked):
        return web.json_response({"error": "send the selected files as assets"}, status=400)
    filename = _registry(request)
    def copy_selected():
        return {"assets": [folders.import_file(filename, row) if str(row.get("path", "")).startswith(folders.SCHEME)
                           else row for row in picked]}
    return await _json_work(copy_selected)


@PromptServer.instance.routes.post("/continuity/folders/reveal")
@same_origin
async def reveal_folder(request):
    body = await request.json()
    filename = _registry(request)
    def reveal():
        path = folders.folder(filename, body.get("folder"))["path"]
        subprocess.Popen(assets.reveal_command(path), stdin=subprocess.DEVNULL,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return {"path": path}
    return await _json_work(reveal)


def _source(request):
    return folders.resolve(_registry(request, view=True), request.query.get("filename", ""))[2]


@PromptServer.instance.routes.get("/continuity/folders/view")
@_media_origin
async def view_file(request):
    path = _source(request)
    if path.lower().endswith(refmod.EXT):
        path = refmod.preview_path(path)
        if path is None:
            return web.Response(status=404)
        row, _, _ = folders.resolve(_registry(request, view=True), request.query["filename"])
        if not folder_paths.is_within_directory(row["path"], path):
            return web.Response(status=404)
    return web.FileResponse(path, headers={"Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff"})


@PromptServer.instance.routes.get("/continuity/folders/thumb")
@_media_origin
async def thumb(request):
    path = _source(request)
    if path.lower().endswith(refmod.EXT):
        sidecar = refmod.preview_path(path)
        row, _, _ = folders.resolve(_registry(request, view=True), request.query["filename"])
        if sidecar is None or not folder_paths.is_within_directory(row["path"], sidecar):
            return web.Response(status=404)
        path = sidecar
    crop = server_routes._query_crop(request.query.get("crop"))
    result = await preview.thumbnail(path, crop=crop, full=request.query.get("full") == "1")
    if result is None:
        return web.Response(status=404)
    return web.FileResponse(result, headers={"Content-Type": "image/webp", "Cache-Control": "no-cache"})


@PromptServer.instance.routes.get("/continuity/folders/probe")
@_media_origin
async def probe(request):
    path = _source(request)
    if path.lower().endswith(refmod.EXT):
        meta = refmod.header(path)
        return web.json_response({"has_audio": False, "duration": None,
                                  "width": meta["latent_w"] * 16, "height": meta["latent_h"] * 16})
    return await _json_work(server_routes._read_header, path)


@PromptServer.instance.routes.get("/continuity/folders/peaks")
@_media_origin
async def peaks(request):
    result = await preview.waveform(_source(request))
    return web.json_response(result or {"peaks": None}, headers={"Cache-Control": "no-cache"})
