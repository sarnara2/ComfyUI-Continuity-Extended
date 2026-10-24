"""Optional Character Sheet Builder bridge. The installed node owns generation."""

import base64
import copy
import json
import os
import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path
from urllib.parse import quote

import folder_paths

NODE = "MiniMaxH3CharacterSheet"
SHEET_KEY = "continuity-sheet-builder"
OUTPUT_KEY = "continuity-sheet-preview"
SOCKETS = {"model": "MODEL", "clip": "CLIP", "video_vae": "VAE", "audio_vae": "VAE"}
LOADERS = ("UNETLoader", "CLIPLoader", "VAELoader", "PreviewImage")
H3_CORE = ("MiniMaxH3SigmaShift", "MiniMaxH3ReferenceToVideo")
INTERNALS = ("H3SheetGrid", "H3SheetCellSink", "H3SheetOnePassSink", "H3SheetOrderGate", "H3SheetJoin")
MODEL_FOLDERS = {"model": "diffusion_models", "clip": "text_encoders",
                 "video_vae": "vae", "audio_vae": "vae"}


class SheetError(ValueError):
    """A sheet request that cannot safely run or be exported."""


def _registry():
    # Optional-backend detection happens on use, after custom nodes have loaded.
    import nodes
    return nodes.NODE_CLASS_MAPPINGS


def _kind(entry):
    return entry[0]


def _options(entry):
    kind = _kind(entry)
    if isinstance(kind, (list, tuple)):
        return list(kind)
    return list(entry[1].get("options", [])) if len(entry) > 1 else []


def _default(entry):
    details = entry[1] if len(entry) > 1 else {}
    if "default" in details:
        return details["default"]
    choices = _options(entry)
    return choices[0] if choices else None


def _schema(registry, node):
    if node not in registry:
        raise SheetError(f"missing registered node: {node}")
    return registry[node].INPUT_TYPES()


def _core_url(node_class):
    import nodes
    owner = sys.modules[node_class.__module__.split(".")[0]]
    plugin_root = Path(owner.__file__).resolve().parent
    for name, directory in nodes.EXTENSION_WEB_DIRS.items():
        web_dir = Path(directory).resolve()
        core = web_dir / "h3sheet_core.mjs"
        if core.is_file() and folder_paths.is_within_directory(str(plugin_root), str(web_dir)):
            return f"/extensions/{quote(name, safe='')}/h3sheet_core.mjs"
    return ""


def capabilities(registry=None, routes_available=True, builder_core_url=None):
    registry = _registry() if registry is None else registry
    answer = {"installed": NODE in registry, "available": False, "reason": "builder_missing",
              "node": NODE, "builder_base": "/h3-character-sheet", "missing_nodes": [],
              "schema": {}, "defaults": {}, "models": {}, "model_defaults": {}, "builder_core_url": ""}
    if not answer["installed"]:
        return answer
    missing = [name for name in (*LOADERS, *H3_CORE, *INTERNALS) if name not in registry]
    answer["missing_nodes"] = missing
    schema = _schema(registry, NODE)
    answer["builder_core_url"] = _core_url(registry[NODE]) if builder_core_url is None else builder_core_url
    required = schema.get("required", {})
    outputs = tuple(registry[NODE].RETURN_TYPES)
    incompatible = any(name not in required or _kind(required[name]) != kind
                       for name, kind in SOCKETS.items()) or not outputs or outputs[0] != "IMAGE"
    widgets = {key: value for group in ("required", "optional")
               for key, value in schema.get(group, {}).items() if key not in SOCKETS}
    incompatible |= any(name not in widgets or _kind(widgets[name]) != kind
                        for name, kind in {"sheet_data": "STRING", "output_name": "STRING", "single_pass": "BOOLEAN"}.items())
    defaults = {key: _default(value) for key, value in widgets.items()}
    incompatible |= any(key in required and value is None for key, value in defaults.items())
    if not missing:
        clip_type = _schema(registry, "CLIPLoader")["required"].get("type")
        clip_types = _options(clip_type) if clip_type is not None else []
        incompatible |= "minimax" not in clip_types
    answer["schema"] = {group: schema.get(group, {}) for group in ("required", "optional")}
    answer["defaults"] = defaults
    loader_fields = {"model": ("UNETLoader", "unet_name"), "clip": ("CLIPLoader", "clip_name"),
                     "video_vae": ("VAELoader", "vae_name"), "audio_vae": ("VAELoader", "vae_name")}
    choices = {}
    for role, folder in MODEL_FOLDERS.items():
        files = list(folder_paths.get_filename_list(folder))
        loader, field = loader_fields[role]
        if loader in registry:
            entry = _schema(registry, loader)["required"].get(field)
            incompatible |= entry is None
            advertised = _options(entry) if entry is not None else []
            files = [file for file in files if file in advertised]
        choices[role] = files
    answer["models"] = choices
    preferences = {"model": ("minimax", "ref2va"), "clip": ("qwen3", "minimax"),
                   "video_vae": ("minimax", "video"), "audio_vae": ("minimax", "audio")}
    for role, files in choices.items():
        words = preferences[role]
        answer["model_defaults"][role] = next((file for file in files if all(word in file.lower() for word in words)), "")
    answer["reason"] = ("nodes_missing" if missing else "builder_incompatible" if incompatible
                        else "builder_routes_missing" if not routes_available else "")
    answer["available"] = not answer["reason"]
    return answer


def _value(name, value, entry):
    kind = _kind(entry)
    options = _options(entry)
    if options:
        if value not in options:
            raise SheetError(f"unsupported {name}: {value}")
    elif kind == "STRING":
        if not isinstance(value, str):
            raise SheetError(f"{name} must be text")
    elif kind == "BOOLEAN":
        if not isinstance(value, bool):
            raise SheetError(f"{name} must be a boolean")
    elif kind == "INT":
        if isinstance(value, bool) or not isinstance(value, int):
            raise SheetError(f"{name} must be an integer")
    elif kind == "FLOAT":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise SheetError(f"{name} must be a number")
    else:
        raise SheetError(f"unsupported Builder input: {name}")
    return value


def _inputs(registry, node, values):
    schema = _schema(registry, node)
    answer = {}
    for name, entry in schema.get("required", {}).items():
        if name in values:
            answer[name] = values[name]
        else:
            value = _default(entry)
            if value is None:
                raise SheetError(f"unsupported required {node} input: {name}")
            answer[name] = value
    for name in schema.get("optional", {}):
        if name in values:
            answer[name] = values[name]
    unknown = set(values) - set(answer)
    if unknown:
        raise SheetError(f"unsupported {node} inputs: {', '.join(sorted(unknown))}")
    return answer


def build(body, registry=None):
    registry = _registry() if registry is None else registry
    capability = capabilities(registry)
    if not capability["available"]:
        raise SheetError(capability["reason"])
    if not isinstance(body, dict):
        raise SheetError("send the sheet request as an object")
    payload = body.get("sheet_data", {})
    settings = body.get("settings", {})
    models = body.get("models", {})
    if not all(isinstance(value, dict) for value in (payload, settings, models)):
        raise SheetError("sheet_data, settings and models must be objects")
    model_files = {}
    for role, folder in MODEL_FOLDERS.items():
        filename = models.get(role)
        if not isinstance(filename, str) or filename not in capability["models"][role]:
            raise SheetError(f"choose an installed {role} file")
        full = folder_paths.get_full_path(folder, filename)
        if not full or not os.path.isfile(full):
            raise SheetError(f"missing model file: {filename}")
        model_files[role] = filename

    schema = capability["schema"]
    widgets = {key: value for group in ("required", "optional")
               for key, value in schema.get(group, {}).items() if key not in SOCKETS}
    unknown = set(settings) - set(widgets)
    if unknown:
        raise SheetError(f"unsupported Builder settings: {', '.join(sorted(unknown))}")
    values = {key: _value(key, value, widgets[key]) for key, value in settings.items()
              if key not in ("output_name", "sheet_data")}
    name = "continuity_sheet_" + uuid.uuid4().hex
    payload = copy.deepcopy(payload)
    payload["name"] = name
    values.update({"output_name": name, "sheet_data": json.dumps(payload, ensure_ascii=False)})
    values.update({"model": ["continuity-sheet-model", 0], "clip": ["continuity-sheet-clip", 0],
                   "video_vae": ["continuity-sheet-video-vae", 0], "audio_vae": ["continuity-sheet-audio-vae", 0]})
    graph = {}
    for key, node, inputs in (
        ("continuity-sheet-model", "UNETLoader", {"unet_name": model_files["model"], "weight_dtype": "default"}),
        ("continuity-sheet-clip", "CLIPLoader", {"clip_name": model_files["clip"], "type": "minimax"}),
        ("continuity-sheet-video-vae", "VAELoader", {"vae_name": model_files["video_vae"]}),
        ("continuity-sheet-audio-vae", "VAELoader", {"vae_name": model_files["audio_vae"]}),
        (SHEET_KEY, NODE, values),
        (OUTPUT_KEY, "PreviewImage", {"images": [SHEET_KEY, 0]}),
    ):
        graph[key] = {"class_type": node, "inputs": _inputs(registry, node, inputs)}
    return graph, {"name": name, "output_node": OUTPUT_KEY, "sheet_node": SHEET_KEY}


def export_source(body):
    """Only a current, manifest-listed Builder sheet PNG may be exported."""
    if not isinstance(body, dict) or body.get("type", "output") != "output":
        raise SheetError("select an output sheet")
    filename = body.get("filename")
    subfolder = body.get("subfolder")
    if not isinstance(filename, str) or not isinstance(subfolder, str):
        raise SheetError("select a sheet file")
    if not filename.lower().endswith(".png") or any(char in filename for char in ("/", "\\", ":")):
        raise SheetError("select a sheet PNG")
    parts = subfolder.replace("\\", "/").split("/")
    if len(parts) not in (2, 3) or parts[0] != "minimax_sheets" or any(part in ("", ".", "..") or ":" in part for part in parts):
        raise SheetError("that file is not in a Builder sheet folder")
    root = Path(folder_paths.get_output_directory()).resolve()
    directory = root.joinpath(*parts).resolve()
    source = (directory / filename).resolve()
    if (not folder_paths.is_within_directory(str(root), str(source)) or
            not folder_paths.is_within_directory(str(root / "minimax_sheets"), str(source)) or source.parent != directory):
        raise SheetError("that sheet path leaves the output folder")
    manifest = directory / (directory.name + ".json")
    if not folder_paths.is_within_directory(str(directory), str(manifest.resolve())):
        raise SheetError("that manifest leaves the sheet folder")
    try:
        record = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise SheetError("the sheet manifest is unavailable") from exc
    if not isinstance(record, dict):
        raise SheetError("the sheet manifest is unavailable")
    if record.get("sheetFile") != filename or not source.is_file():
        raise SheetError("that sheet changed; refresh the results")
    with source.open("rb") as handle:
        if handle.read(8) != b"\x89PNG\r\n\x1a\n":
            raise SheetError("that file is not a PNG sheet")
    return source


def choose_save(filename, title="Save sheet PNG"):
    if sys.platform != "win32":
        raise SheetError("Saving to a chosen folder requires ComfyUI running locally on Windows.")
    script = Path(__file__).with_name("sheet_save_dialog.ps1").read_text(encoding="utf-8")
    encoded = base64.b64encode(script.encode("utf-16le")).decode("ascii")
    env = dict(os.environ, CONTINUITY_SHEET_SAVE=json.dumps({"filename": filename, "title": title}, ensure_ascii=False))
    executable = os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    result = subprocess.run([executable, "-NoProfile", "-STA", "-EncodedCommand", encoded],
                            capture_output=True, timeout=600, creationflags=subprocess.CREATE_NO_WINDOW, env=env)
    if result.returncode:
        raise SheetError("the Save As dialog could not open")
    return result.stdout.decode("utf-8-sig").strip() or None


def export_copy(source, destination):
    """Publish a complete copy without replacing any existing file."""
    destination = Path(destination)
    if not destination.is_absolute() or destination.suffix.lower() != ".png" or not destination.parent.is_dir():
        raise SheetError("choose an existing folder and a PNG filename")
    if destination.exists():
        raise SheetError("that file already exists; choose another filename")
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(prefix=".continuity-sheet-", suffix=".png", dir=destination.parent, delete=False) as outgoing:
            temporary = Path(outgoing.name)
            with Path(source).open("rb") as incoming:
                shutil.copyfileobj(incoming, outgoing, 1 << 20)
            outgoing.flush()
            os.fsync(outgoing.fileno())
        # Windows rename also works on FAT/exFAT and refuses an existing target.
        # POSIX rename replaces it, so publish with a no-clobber hard link there.
        if sys.platform == "win32":
            os.rename(temporary, destination)
        else:
            os.link(temporary, destination)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return {"saved": True, "path": str(destination), "filename": destination.name}
