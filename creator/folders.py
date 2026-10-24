"""Folders granted by the local picker, and imports into core's existing roots."""

import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import uuid

import folder_paths

from . import assets, refmod

FILE = "continuity.folders.json"
SCHEME = "external:"
MAX_ASSETS = 20000
MAX_CHECKS = 256
MAX_RELATIVE = 4096
KINDS = ("image", "video", "audio", "renders", "refmods")
_ID = re.compile(r"^[a-f0-9]{32}$")
_imports = threading.Lock()


class FolderError(ValueError):
    pass


def load(filename):
    try:
        with open(filename, encoding="utf-8") as handle:
            raw = json.load(handle)
    except FileNotFoundError:
        return []
    except (OSError, ValueError) as exc:
        raise FolderError("could not read the saved folders") from exc
    if not isinstance(raw, dict) or not isinstance(raw.get("folders"), list):
        raise FolderError("the saved folder list is invalid")
    rows = []
    for row in raw["folders"]:
        if not isinstance(row, dict) or not _ID.fullmatch(str(row.get("id", ""))):
            continue
        path = row.get("path")
        if not isinstance(path, str) or not os.path.isabs(path):
            continue
        rows.append({"id": row["id"], "path": path,
                     "name": str(row.get("name") or os.path.basename(path) or path)})
    return rows


def save(filename, rows):
    directory = os.path.dirname(filename)
    os.makedirs(directory, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".continuity-folders-", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump({"folders": rows}, handle, ensure_ascii=False)
        os.replace(temporary, filename)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def register(filename, path):
    path = os.path.realpath(path)
    if not os.path.isdir(path):
        raise FolderError("that folder is no longer available")
    rows = load(filename)
    for row in rows:
        if os.path.normcase(os.path.realpath(row["path"])) == os.path.normcase(path):
            return row
    row = {"id": uuid.uuid4().hex, "path": path,
           "name": os.path.basename(path.rstrip(os.sep)) or path}
    rows.append(row)
    save(filename, rows)
    return row


def remove(filename, folder_id):
    rows = load(filename)
    kept = [row for row in rows if row["id"] != folder_id]
    if len(kept) == len(rows):
        raise FolderError("that folder is not registered")
    save(filename, kept)


def folder(filename, folder_id):
    row = next((row for row in load(filename) if row["id"] == folder_id), None)
    if row is None:
        raise FolderError("that folder is not registered")
    if not os.path.isdir(row["path"]):
        raise FolderError("that folder is no longer available")
    return row


def relative(name):
    parts = str(name).replace("\\", "/").split("/")
    if any(not part or part in (".", "..") or part.endswith((".", " ")) or ":" in part or "\0" in part for part in parts):
        raise FolderError("not a file in the selected folder")
    return "/".join(parts)


def resolve(filename, token):
    if not str(token).startswith(SCHEME):
        raise FolderError("not a file in the selected folder")
    folder_id, _, name = token[len(SCHEME):].partition("/")
    row = folder(filename, folder_id)
    name = relative(name)
    path = os.path.realpath(os.path.join(row["path"], *name.split("/")))
    if not folder_paths.is_within_directory(os.path.realpath(row["path"]), path) or not os.path.isfile(path):
        raise FolderError("not a file in the selected folder")
    if path.lower().endswith(refmod.EXT):
        refmod.header(path)
    elif assets.classify(path) not in ("image", "video", "audio") or path.lower().endswith(".svg"):
        raise FolderError("not a supported media file")
    return row, name, path


def listing(filename, folder_id, kind, directory=None):
    # An omitted directory retains the original recursive contract. The shared
    # picker opts into immediate-child browsing with an explicit root "".
    if directory is not None:
        return directory_listing(filename, folder_id, kind, directory)
    if kind not in KINDS:
        raise FolderError("not a picker tab")
    selected = folder(filename, folder_id)
    root = os.path.realpath(selected["path"])
    pending, rows, visited = [root], [], set()
    while pending:
        directory = pending.pop()
        identity = os.path.normcase(os.path.realpath(directory))
        if identity in visited:
            continue
        visited.add(identity)
        try:
            with os.scandir(directory) as scan:
                entries = sorted(scan, key=lambda entry: entry.name)
        except OSError:
            if directory == root:
                raise
            continue
        for entry in entries:
            try:
                if entry.name.startswith(".") or not folder_paths.is_within_directory(root, os.path.realpath(entry.path)):
                    continue
                if entry.is_dir(follow_symlinks=False):
                    pending.append(entry.path)
                    continue
                if not entry.is_file(follow_symlinks=True):
                    continue
                name = os.path.relpath(entry.path, root).replace(os.sep, "/")
                if kind == "refmods":
                    if not entry.name.lower().endswith(refmod.EXT):
                        continue
                    row = refmod.row_for(entry.path, name[:-len(refmod.EXT)])
                else:
                    media_kind = assets.classify(entry.name)
                    if entry.name.lower().endswith(".svg") or media_kind not in (("image", "video") if kind == "renders" else (kind,)):
                        continue
                    stat = entry.stat()
                    row = {"name": entry.name, "kind": media_kind, "size": stat.st_size,
                           "mtime": stat.st_mtime, "subfolder": os.path.dirname(name).replace(os.sep, "/")}
            except (OSError, refmod.RefModError):
                continue
            row["path"] = f"{SCHEME}{selected['id']}/{name}"
            rows.append(row)
            if len(rows) >= MAX_ASSETS:
                return {"assets": sorted(rows, key=lambda row: row["mtime"], reverse=True), "truncated": True}
    return {"assets": sorted(rows, key=lambda row: row["mtime"], reverse=True), "truncated": False}


def _directory(filename, folder_id, directory):
    if not isinstance(directory, str) or len(directory) > MAX_RELATIVE:
        raise FolderError("not a directory in the selected folder")
    name = relative(directory) if directory else ""
    selected = folder(filename, folder_id)
    root = os.path.realpath(selected["path"])
    path = os.path.realpath(os.path.join(root, *name.split("/"))) if name else root
    if not folder_paths.is_within_directory(root, path) or not os.path.isdir(path):
        raise FolderError("not a directory in the selected folder")
    return selected, name, root, path


def _asset_row(path, name, kind):
    """Fresh listing metadata only; never import, decode, probe or build media."""
    if kind == "refmods":
        if not name.lower().endswith(refmod.EXT) or not path.lower().endswith(refmod.EXT):
            return None
        return refmod.row_for(path, name[:-len(refmod.EXT)])
    media_kind = assets.classify(path)
    if name.lower().endswith(".svg") or path.lower().endswith(".svg") or media_kind not in (("image", "video") if kind == "renders" else (kind,)):
        return None
    stat = os.stat(path)
    return {"name": name.rsplit("/", 1)[-1], "kind": media_kind, "size": stat.st_size,
            "mtime": stat.st_mtime, "subfolder": name.rpartition("/")[0]}


def directory_listing(filename, folder_id, kind, directory):
    if kind not in KINDS:
        raise FolderError("not a picker tab")
    selected, name, root, path = _directory(filename, folder_id, directory)
    rows, children, truncated = [], [], False
    with os.scandir(path) as scan:
        entries = sorted(scan, key=lambda entry: entry.name)
    for entry in entries:
        try:
            resolved = os.path.realpath(entry.path)
            if entry.name.startswith(".") or not folder_paths.is_within_directory(root, resolved):
                continue
            child = relative(f"{name}/{entry.name}" if name else entry.name)
            if entry.is_dir(follow_symlinks=True):
                children.append({"name": entry.name, "directory": child})
            elif entry.is_file(follow_symlinks=True):
                row = _asset_row(resolved, child, kind)
                if row is None:
                    continue
                row["path"] = f"{SCHEME}{selected['id']}/{child}"
                rows.append(row)
            else:
                continue
        except (OSError, FolderError, refmod.RefModError):
            continue
        if len(rows) + len(children) >= MAX_ASSETS:
            truncated = True
            break
    return {"assets": sorted(rows, key=lambda row: row["mtime"], reverse=True),
            "folders": children, "directory": name,
            "parent": name.rpartition("/")[0] if name else None, "truncated": truncated}


def metadata(filename, paths, kind):
    """Validate bounded remembered checks against their actual registered files.

    Rows may span directories/grants. A vanished or revoked file is simply not
    selected on restore. Client data never becomes a synthetic asset row.
    """
    if kind not in KINDS:
        raise FolderError("not a picker tab")
    if not isinstance(paths, list) or len(paths) > MAX_CHECKS or any(
            not isinstance(token, str) or not token or len(token) > MAX_RELATIVE for token in paths):
        raise FolderError("send at most 256 registered file paths")
    rows, missing, seen = [], [], set()
    for token in paths:
        if token in seen:
            continue
        seen.add(token)
        try:
            selected, name, path = resolve(filename, token)
            row = _asset_row(path, name, kind)
            if row is None:
                raise FolderError("not a file for this picker tab")
            row["path"] = f"{SCHEME}{selected['id']}/{name}"
            rows.append(row)
        except (FolderError, refmod.RefModError, OSError):
            missing.append(token)
    return {"assets": rows, "missing": missing}


def _copy(source, root, name):
    target = os.path.join(root, *relative(name).split("/"))
    if not folder_paths.is_within_directory(os.path.realpath(root), os.path.realpath(target)):
        raise FolderError("the import destination leaves ComfyUI's folder")
    stat = os.stat(source)
    with _imports:
        if os.path.isfile(target):
            cached = os.stat(target)
            if cached.st_size == stat.st_size and cached.st_mtime_ns == stat.st_mtime_ns:
                return target
            stem, ext = os.path.splitext(target)
            target = f"{stem}-{uuid.uuid4().hex[:8]}{ext}"
        os.makedirs(os.path.dirname(target), exist_ok=True)
        if not folder_paths.is_within_directory(os.path.realpath(root), os.path.realpath(target)):
            raise FolderError("the import destination leaves ComfyUI's folder")
        # Never replace an existing file, including a user's edited import.
        try:
            with open(source, "rb") as incoming, open(target, "xb") as outgoing:
                shutil.copyfileobj(incoming, outgoing, 1 << 20)
            shutil.copystat(source, target)
        except OSError:
            # Only the just-created destination belongs to this operation.
            if 'outgoing' in locals() and os.path.exists(target):
                os.unlink(target)
            raise
    return target


def import_file(filename, picked):
    row, name, source = resolve(filename, picked.get("path", ""))
    stat = os.stat(source)
    sidecars = [path for path in refmod.sidecars(source)
                if folder_paths.is_within_directory(row["path"], os.path.realpath(path))] if source.lower().endswith(refmod.EXT) else []
    identity = f"{source}|{stat.st_size}|{stat.st_mtime_ns}"
    for path in sidecars:
        extra = os.stat(path)
        identity += f"|{path}|{extra.st_size}|{extra.st_mtime_ns}"
    version = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:16]
    prefix = f"continuity/imports/{row['id']}/{version}"
    if source.lower().endswith(refmod.EXT):
        root = refmod.home()
        target = _copy(source, root, f"{prefix}/{name}")
        for sidecar in sidecars:
            dest = os.path.splitext(os.path.relpath(target, root))[0] + os.path.splitext(sidecar)[1]
            _copy(sidecar, root, dest.replace(os.sep, "/"))
        mod_name = os.path.relpath(target, root).replace(os.sep, "/")[:-len(refmod.EXT)]
        imported = refmod.row_for(target, mod_name)
    else:
        root = folder_paths.get_input_directory()
        target = _copy(source, root, f"{prefix}/{name}")
        imported = {"path": os.path.relpath(target, root).replace(os.sep, "/"),
                    "kind": assets.classify(source)}
    return {**picked, **imported}


def choose():
    if sys.platform != "win32":
        raise FolderError("native folder selection is available on local Windows installations")
    # Package-owned constant code, never a user path interpolated into a shell.
    # IFileDialog supplies the full Explorer UI; its actual HWND is raised on
    # initialization instead of trusting a hidden owner's TopMost property.
    with open(os.path.join(os.path.dirname(__file__), "folder_dialog.ps1"), encoding="utf-8") as handle:
        script = handle.read()
    encoded = base64.b64encode(script.encode("utf-16le")).decode("ascii")
    executable = os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    answer = subprocess.run([executable, "-NoProfile", "-STA", "-EncodedCommand", encoded],
                            capture_output=True, timeout=600, creationflags=subprocess.CREATE_NO_WINDOW)
    if answer.returncode:
        raise FolderError("the folder chooser could not open")
    return answer.stdout.decode("utf-8-sig").strip() or None
