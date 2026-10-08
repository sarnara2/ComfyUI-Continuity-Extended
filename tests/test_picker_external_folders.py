"""Real folder scans/imports in temporary directories; no native window or render."""

import asyncio
import base64
import importlib.util
import json
import os
from pathlib import Path
import struct
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

import layout


class Paths:
    media = {".png": "image", ".jpg": "image", ".svg": "image", ".mp4": "video", ".wav": "audio"}
    input = ""
    mods = ""

    @staticmethod
    def filter_files_content_types(files, kinds):
        return [name for name in files if Paths.media.get(Path(name).suffix.lower()) in kinds]

    @staticmethod
    def is_within_directory(root, target):
        return os.path.commonpath((os.path.realpath(root), os.path.realpath(target))) == os.path.realpath(root)

    @staticmethod
    def get_input_directory():
        return Paths.input

    @staticmethod
    def exists_annotated_filepath(name):
        return False


sys.modules["folder_paths"] = Paths
pkg = layout.load("folders", package="mmc_picker_folders")
F, R = pkg.folders, pkg.refmod


def write_mod(path):
    table = {"latent": {"dtype": "F16", "shape": [1, 24, 1, 16, 16], "data_offsets": [0, 12288]},
             "__metadata__": {"refmod_meta": json.dumps({"kind": "image", "mode": "training", "_format_version": 4})}}
    body = json.dumps(table).encode("utf-8")
    path.write_bytes(struct.pack("<Q", len(body)) + body + b"\0" * 12288)


class FolderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "source 한국어"
        self.source.mkdir()
        self.other = self.root / "never scan"
        self.other.mkdir()
        Paths.input = str(self.root / "input")
        Paths.mods = str(self.root / "mods")
        Path(Paths.input).mkdir()
        Path(Paths.mods).mkdir()
        self.registry = str(self.root / "user" / F.FILE)
        self.folder = F.register(self.registry, str(self.source))
        self.patch = patch.object(R, "home", lambda: Paths.mods)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        for name in ["image.png", "clip.mp4", "sound.wav", "notes.txt", "unsafe.svg"]:
            (self.source / name).write_bytes(b"original")

    def token(self, name):
        return f"external:{self.folder['id']}/{name}"

    def names(self, kind):
        return sorted(row["name"] for row in F.listing(self.registry, self.folder["id"], kind)["assets"])

    def test_registration_is_persistent_and_duplicate_is_same_grant(self):
        self.assertEqual(F.register(self.registry, str(self.source)), self.folder)
        self.assertEqual(F.load(self.registry), [self.folder])
        self.assertEqual(len(self.folder["id"]), 32)

    def test_tabs_filter_media_and_do_not_mix_types(self):
        self.assertEqual(self.names("image"), ["image.png"])
        self.assertEqual(self.names("video"), ["clip.mp4"])
        self.assertEqual(self.names("audio"), ["sound.wav"])
        self.assertEqual(self.names("renders"), ["clip.mp4", "image.png"])
        self.assertEqual(self.names("refmods"), [])

    def test_refmods_validate_headers_and_keep_real_metadata(self):
        write_mod(self.source / "valid.safetensors")
        (self.source / "bad.safetensors").write_bytes(b"not a mod")
        row, = F.listing(self.registry, self.folder["id"], "refmods")["assets"]
        self.assertTrue(row["mod"])
        self.assertEqual((row["kind"], row["space"], row["tokens"]), ("image", "h3_video", 64))
        self.assertEqual(row["path"], self.token("valid.safetensors"))

    def test_scan_only_selected_grant_and_reads_new_files_each_time(self):
        F.register(self.registry, str(self.other))
        real = os.scandir
        walked = []
        with patch.object(F.os, "scandir", lambda path: (walked.append(str(path)), real(path))[1]):
            self.names("image")
        self.assertEqual(walked, [str(self.source)])
        (self.source / "new.jpg").write_bytes(b"new")
        self.assertEqual(self.names("image"), ["image.png", "new.jpg"])

    def test_nested_files_and_dot_folders(self):
        (self.source / "nested").mkdir()
        (self.source / "nested" / "next.png").write_bytes(b"nested")
        (self.source / ".hidden").mkdir()
        (self.source / ".hidden" / "hidden.png").write_bytes(b"hidden")
        self.assertEqual(self.names("image"), ["image.png", "next.png"])

    def test_remove_only_forgets_shortcut_and_keeps_originals(self):
        before = (self.source / "image.png").read_bytes()
        F.remove(self.registry, self.folder["id"])
        self.assertEqual(F.load(self.registry), [])
        self.assertEqual((self.source / "image.png").read_bytes(), before)

    def test_unregistered_and_path_traversal_tokens_are_refused(self):
        for token in [self.token("../never scan/file.png"), self.token("/image.png"),
                      self.token("C:/image.png"), self.token(".. /image.png"), "external:unregistered/image.png"]:
            with self.subTest(token=token), self.assertRaises(F.FolderError):
                F.resolve(self.registry, token)

    def test_nonmedia_and_svg_cannot_be_served_or_imported(self):
        for name in ["notes.txt", "unsafe.svg"]:
            with self.assertRaises(F.FolderError):
                F.import_file(self.registry, {"path": self.token(name)})

    def test_selected_import_keeps_bytes_metadata_and_original(self):
        picked = {"path": self.token("clip.mp4"), "kind": "video", "trim": {"start": 1, "end": 2},
                  "takes": "edit", "ref_size": "match", "track": "both"}
        imported = F.import_file(self.registry, picked)
        self.assertFalse(imported["path"].startswith("external:"))
        self.assertEqual(Path(Paths.input, imported["path"]).read_bytes(), b"original")
        self.assertEqual((self.source / "clip.mp4").read_bytes(), b"original")
        self.assertEqual({k: imported[k] for k in ["trim", "takes", "ref_size", "track"]},
                         {k: picked[k] for k in ["trim", "takes", "ref_size", "track"]})
        self.assertEqual(len(list(Path(Paths.input).rglob("*.*"))), 1)

    def test_unchanged_import_reuses_file_but_source_change_gets_new_path(self):
        a = F.import_file(self.registry, {"path": self.token("image.png")})
        b = F.import_file(self.registry, {"path": self.token("image.png")})
        self.assertEqual(a["path"], b["path"])
        (self.source / "image.png").write_bytes(b"new source bytes")
        c = F.import_file(self.registry, {"path": self.token("image.png")})
        self.assertNotEqual(a["path"], c["path"])
        self.assertEqual(Path(Paths.input, a["path"]).read_bytes(), b"original")

    def test_modified_import_never_gets_overwritten(self):
        a = F.import_file(self.registry, {"path": self.token("image.png")})
        original = Path(Paths.input, a["path"])
        original.write_bytes(b"user edited copy")
        b = F.import_file(self.registry, {"path": self.token("image.png")})
        self.assertNotEqual(a["path"], b["path"])
        self.assertEqual(original.read_bytes(), b"user edited copy")

    def test_refmod_and_preview_import_to_models_without_changing_source(self):
        write_mod(self.source / "person.safetensors")
        (self.source / "person.png").write_bytes(b"preview")
        imported = F.import_file(self.registry, {"path": self.token("person.safetensors"), "takes": "person"})
        self.assertTrue(imported["path"].startswith("refmod:"))
        self.assertEqual(imported["takes"], "person")
        target = Path(Paths.mods, R.name_of(imported["path"]) + ".safetensors")
        self.assertEqual(target.read_bytes(), (self.source / "person.safetensors").read_bytes())
        self.assertEqual(target.with_suffix(".png").read_bytes(), b"preview")

    def test_listing_cap_is_explicit(self):
        with patch.object(F, "MAX_ASSETS", 1):
            self.assertTrue(F.listing(self.registry, self.folder["id"], "renders")["truncated"])

    def test_refmod_preview_change_gets_new_pair_not_stale_sidecar(self):
        write_mod(self.source / "person.safetensors")
        picture = self.source / "person.png"
        picture.write_bytes(b"old preview")
        a = F.import_file(self.registry, {"path": self.token("person.safetensors")})
        picture.write_bytes(b"new preview bytes")
        b = F.import_file(self.registry, {"path": self.token("person.safetensors")})
        self.assertNotEqual(a["path"], b["path"])
        self.assertEqual(Path(Paths.mods, R.name_of(b["path"]) + ".png").read_bytes(), b"new preview bytes")

    def test_escaping_link_is_refused_before_listing_or_import(self):
        original = os.path.realpath
        file = str(self.source / "image.png")
        outside = str(self.other / "private.png")
        with patch.object(F.os.path, "realpath", lambda path: outside if str(path) == file else original(path)):
            self.assertEqual(self.names("image"), [])
            with self.assertRaises(F.FolderError):
                F.import_file(self.registry, {"path": self.token("image.png")})

    def test_import_destination_link_cannot_leave_input_root(self):
        original = os.path.realpath
        prefix = str(Path(Paths.input) / "continuity")
        with patch.object(F.os.path, "realpath", lambda path: str(self.other / "escape.png")
                          if str(path).startswith(prefix) else original(path)):
            with self.assertRaises(F.FolderError):
                F.import_file(self.registry, {"path": self.token("image.png")})
        self.assertEqual(list(self.other.iterdir()), [])

    def test_file_disappearing_during_scan_does_not_hide_other_files(self):
        original = os.scandir
        class Entry:
            def __init__(self, entry):
                self.entry = entry
            def __getattr__(self, name):
                return getattr(self.entry, name)
            def stat(self):
                if self.entry.name == "image.png":
                    raise FileNotFoundError("file disappeared")
                return self.entry.stat()
        class Scan:
            def __init__(self, path):
                self.scan = original(path)
            def __enter__(self):
                return [Entry(entry) for entry in self.scan]
            def __exit__(self, *args):
                self.scan.close()
        with patch.object(F.os, "scandir", Scan):
            self.assertEqual(self.names("renders"), ["clip.mp4"])

    def test_deleted_folder_is_retained_as_shortcut_but_reports_missing(self):
        empty = F.register(self.registry, str(self.other))
        self.other.rmdir()
        self.assertIn(empty, F.load(self.registry))
        with self.assertRaises(F.FolderError):
            F.listing(self.registry, empty["id"], "image")

    def test_invalid_saved_json_is_not_silently_overwritten(self):
        Path(self.registry).write_text("not JSON", encoding="utf-8")
        with self.assertRaises(F.FolderError):
            F.register(self.registry, str(self.other))
        self.assertEqual(Path(self.registry).read_text(), "not JSON")

    def test_native_chooser_is_encoded_constant_and_cancel_is_inert(self):
        # No actual dialog or helper process is launched by this test.
        answer = types.SimpleNamespace(returncode=0, stdout="H:\\한글 폴더".encode("utf-8"))
        with patch.object(F.sys, "platform", "win32"), patch.object(F.subprocess, "CREATE_NO_WINDOW", 0, create=True), \
                patch.object(F.subprocess, "run", return_value=answer) as run:
            self.assertEqual(F.choose(), "H:\\한글 폴더")
            args = run.call_args.args[0]
            script = base64.b64decode(args[-1]).decode("utf-16le")
            self.assertIn("IFileDialog", script)
            self.assertIn("dialog.Show(owner.Handle)", script)
            self.assertIn("SetWindowPos(window, new IntPtr(-1)", script)
            self.assertIn("SetForegroundWindow(window)", script)
            self.assertIn("$ErrorActionPreference = 'Stop'", script)
            self.assertNotIn("FolderBrowserDialog", script)
            self.assertIn("-STA", args)
            self.assertNotIn(str(self.source), script)
            answer.stdout = b""
            self.assertIsNone(F.choose())

    def test_native_chooser_failure_is_not_reported_as_cancel(self):
        answer = types.SimpleNamespace(returncode=1, stdout=b"")
        with patch.object(F.sys, "platform", "win32"), patch.object(F.subprocess, "CREATE_NO_WINDOW", 0, create=True), \
                patch.object(F.subprocess, "run", return_value=answer), self.assertRaises(F.FolderError):
            F.choose()


if __name__ == "__main__":
    unittest.main(verbosity=2)
