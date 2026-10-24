"""Registered hierarchy/check metadata over isolated temporary trees only.

No ComfyUI boot, media decoding, tensor loading, GPU, network or user data.
Run: python tests/test_external_folders.py
"""
import ast
import hashlib
import importlib.util
import json
import os
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import layout


class FolderPaths:
    MIME = {".png": "image", ".jpg": "image", ".svg": "image", ".mp4": "video", ".wav": "audio"}

    @classmethod
    def filter_files_content_types(cls, files, kinds):
        return [name for name in files if cls.MIME.get(os.path.splitext(name)[1].lower()) in kinds]

    @staticmethod
    def is_within_directory(root, path):
        root, path = os.path.normcase(os.path.realpath(root)), os.path.normcase(os.path.realpath(path))
        try:
            return os.path.commonpath([root, path]) == root
        except ValueError:
            return False

    @staticmethod
    def get_input_directory():
        return FolderPaths.input


sys.modules["folder_paths"] = FolderPaths
pkg = layout.load("assets", "refmod", "folders", package="external_folder_test")
folders, refmod = pkg.folders, pkg.refmod
BASELINE = os.environ.get("CONTINUITY_BASELINE_DIR", str(Path(layout.ROOT).parent / "baseline"))


def load_original():
    filename = Path(BASELINE) / "creator/folders.py"
    if not filename.is_file():
        raise AssertionError("Frozen baseline exists for legacy/source preservation proof")
    spec = importlib.util.spec_from_file_location("external_folder_test.original_folders", filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


original = load_original()


class ExternalFolders(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="continuity-external-test-")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.root, self.outside, self.input = (self.base / name for name in ("registered", "outside", "input"))
        for path in (self.root, self.outside, self.input):
            path.mkdir()
        FolderPaths.input = str(self.input)
        self.registry = str(self.base / "registry.json")
        self.grant = folders.register(self.registry, str(self.root))["id"]
        for name, content in {"root.png": b"root", "root.mp4": b"video", "root.wav": b"audio",
                              "child/one.png": b"one", "child/deep/two.png": b"two",
                              "空 폴더/三.png": b"unicode", "papers/notes.txt": b"notes",
                              ".hidden.png": b"hidden", "vector.svg": b"svg"}.items():
            self.put(self.root / name, content)
        (self.root / "empty").mkdir()
        self.put(self.outside / "escape.png", b"outside-original")

    @staticmethod
    def put(path, content):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)

    def token(self, name, grant=None):
        return f"external:{grant or self.grant}/{name}"

    def test_legacy_recursive_omission_is_exact_for_every_original_kind(self):
        for kind in folders.KINDS:
            self.assertEqual(folders.listing(self.registry, self.grant, kind),
                             original.listing(self.registry, self.grant, kind))
        self.assertNotIn("folders", folders.listing(self.registry, self.grant, "image"))

    def test_root_lists_direct_media_and_all_immediate_folders(self):
        answer = folders.listing(self.registry, self.grant, "image", "")
        self.assertEqual([row["name"] for row in answer["assets"]], ["root.png"])
        self.assertEqual(answer["folders"], [{"name": name, "directory": name}
                         for name in sorted(["child", "empty", "papers", "空 폴더"])])
        self.assertEqual((answer["directory"], answer["parent"], answer["truncated"]), ("", None, False))
        self.assertTrue(all("kind" not in row and "path" not in row for row in answer["folders"]))

    def test_deep_unicode_empty_and_normalized_relative_navigation(self):
        child = folders.listing(self.registry, self.grant, "image", "child")
        self.assertEqual([row["path"] for row in child["assets"]], [self.token("child/one.png")])
        self.assertEqual(child["folders"], [{"name": "deep", "directory": "child/deep"}])
        deep = folders.listing(self.registry, self.grant, "image", "child\\deep")
        self.assertEqual((deep["directory"], deep["parent"]), ("child/deep", "child"))
        self.assertEqual(deep["assets"][0]["subfolder"], "child/deep")
        self.assertEqual(folders.listing(self.registry, self.grant, "audio", "empty")["assets"], [])
        self.assertEqual(folders.listing(self.registry, self.grant, "image", "空 폴더")["assets"][0]["name"], "三.png")

    def test_each_original_media_kind_and_render_union(self):
        for kind, names in (("image", ["root.png"]), ("video", ["root.mp4"]), ("audio", ["root.wav"]),
                            ("renders", ["root.mp4", "root.png"])):
            self.assertEqual(sorted(row["name"] for row in folders.listing(self.registry, self.grant, kind, "")["assets"]), names)

    def test_new_metadata_kind_uses_the_resolved_file_not_a_misleading_alias(self):
        self.assertIsNone(folders._asset_row(str(self.root / "root.wav"), "alias.png", "image"))
        self.assertIsNone(folders._asset_row(str(self.root / "vector.svg"), "alias.png", "image"))
        self.assertIsNone(folders._asset_row(str(self.root / "root.png"), "alias.safetensors", "refmods"))

    def test_refmod_rows_reuse_real_header_metadata_without_loading_tensor(self):
        metadata = {"format_version": 4, "mode": "full", "kind": "image", "latent_t": 1,
                    "latent_h": 2, "latent_w": 2, "description": "isolated"}
        table = {"__metadata__": {"refmod_meta": json.dumps(metadata)},
                 "latent": {"dtype": "F32", "shape": [1, 24, 1, 2, 2], "data_offsets": [0, 384]}}
        header = json.dumps(table).encode()
        self.put(self.root / "child/model.safetensors", struct.pack("<Q", len(header)) + header + b"\0" * 384)
        with patch.object(refmod, "load_latent", side_effect=AssertionError("no tensor load")):
            direct = folders.listing(self.registry, self.grant, "refmods", "child")["assets"]
            checked = folders.metadata(self.registry, [self.token("child/model.safetensors")], "refmods")
        self.assertEqual(checked["assets"], direct)
        self.assertEqual(checked["missing"], [])
        self.assertTrue(direct[0]["mod"])

    def test_directory_path_attacks_and_wrong_types_are_refused(self):
        attacks = ["..", "../outside", "child/../deep", ".", "/absolute", "\\absolute", "C:\\Windows",
                   "//server/share", "\\\\server\\share", "child//deep", "child:stream", "child\0evil",
                   "child.", "child ", "child/.", "child/..", "root.png", "unavailable", "x" * 4097, 1, True, {}, []]
        for value in attacks:
            with self.subTest(value=value), self.assertRaises(folders.FolderError):
                folders.directory_listing(self.registry, self.grant, "image", value)

    def test_external_metadata_spans_directories_and_grants_in_requested_order(self):
        other = folders.register(self.registry, str(self.outside))["id"]
        paths = [self.token("child/deep/two.png"), self.token("escape.png", other), self.token("root.png")]
        answer = folders.metadata(self.registry, paths + paths, "image")
        self.assertEqual([row["path"] for row in answer["assets"]], paths)
        self.assertEqual(answer["missing"], [])
        self.assertEqual([row["size"] for row in answer["assets"]], [3, 16, 4])

    def test_missing_revoked_unsafe_svg_wrong_kind_and_directories_drop_gracefully(self):
        rejected = [self.token("vanished.png"), self.token("root.mp4"), self.token("vector.svg"),
                    self.token("empty"), self.token("../outside/escape.png"), self.token("child:stream.png"),
                    self.token("child//one.png"), self.token("child/../root.png"), self.token("child./one.png"),
                    "input.png", "external:" + "f" * 32 + "/missing.png", self.token("root.png\0evil")]
        answer = folders.metadata(self.registry, rejected + [self.token("root.png")], "image")
        self.assertEqual(answer["missing"], rejected)
        self.assertEqual([row["path"] for row in answer["assets"]], [self.token("root.png")])
        folders.remove(self.registry, self.grant)
        self.assertEqual(folders.metadata(self.registry, [self.token("root.png")], "image")["missing"], [self.token("root.png")])

    def test_batch_validation_is_bounded_and_current_kind_is_required(self):
        for paths in (None, {}, "file", [None], [1], [""], ["x" * 4097], [self.token("root.png")] * 257):
            with self.subTest(paths=type(paths)), self.assertRaises(folders.FolderError):
                folders.metadata(self.registry, paths, "image")
        with self.assertRaises(folders.FolderError):
            folders.metadata(self.registry, [], "arbitrary")
        self.assertEqual(folders.metadata(self.registry, [], "image"), {"assets": [], "missing": []})
        self.assertEqual(len(folders.metadata(self.registry, [self.token("root.png")] * 256, "image")["assets"]), 1)

    def test_fresh_metadata_reads_no_import_and_preserves_all_original_files(self):
        def inventory():
            return {str(path.relative_to(self.base)): hashlib.sha256(path.read_bytes()).hexdigest()
                    for path in self.base.rglob("*") if path.is_file()}
        before = inventory()
        with patch.object(folders, "import_file", side_effect=AssertionError("no import")), \
                patch.object(folders, "_copy", side_effect=AssertionError("no copy")):
            folders.listing(self.registry, self.grant, "image", "")
            folders.metadata(self.registry, [self.token("root.png"), self.token("child/one.png")], "image")
        self.assertEqual(before, inventory())
        self.put(self.root / "root.png", b"fresh-metadata-test")
        self.assertEqual(folders.metadata(self.registry, [self.token("root.png")], "image")["assets"][0]["size"], 19)

    def test_explicit_import_still_preserves_originals_and_never_overwrites_edited_copy(self):
        picked = {"path": self.token("root.png"), "kind": "image"}
        first = folders.import_file(self.registry, picked)
        self.assertEqual((self.root / "root.png").read_bytes(), b"root")
        self.assertEqual(folders.import_file(self.registry, picked)["path"], first["path"])
        self.put(self.input / first["path"], b"user-edited-import")
        second = folders.import_file(self.registry, picked)
        self.assertNotEqual(second["path"], first["path"])
        self.assertEqual((self.input / first["path"]).read_bytes(), b"user-edited-import")
        self.assertEqual((self.root / "root.png").read_bytes(), b"root")

    def test_directory_cap_counts_folders_and_files_without_recursive_walk(self):
        with patch.object(folders, "MAX_ASSETS", 2):
            answer = folders.listing(self.registry, self.grant, "image", "")
        self.assertTrue(answer["truncated"])
        self.assertEqual(len(answer["folders"]) + len(answer["assets"]), 2)

    def test_missing_root_and_permission_failure_are_not_synthetic_folders(self):
        with patch.object(folders.os, "scandir", side_effect=PermissionError("isolated denial")):
            with self.assertRaises(PermissionError):
                folders.listing(self.registry, self.grant, "image", "")
        self.assertEqual(folders.metadata(self.registry, [self.token("no.png")], "image")["assets"], [])

    def test_concurrent_file_disappearance_does_not_drop_other_direct_assets(self):
        actual = folders._asset_row
        def racing(path, name, kind):
            if name == "root.png":
                raise FileNotFoundError("isolated concurrent removal")
            return actual(path, name, kind)
        with patch.object(folders, "_asset_row", side_effect=racing):
            answer = folders.listing(self.registry, self.grant, "renders", "")
            checked = folders.metadata(self.registry, [self.token("root.png"), self.token("root.mp4")], "renders")
        self.assertEqual([row["name"] for row in answer["assets"]], ["root.mp4"])
        self.assertEqual(checked["missing"], [self.token("root.png")])
        self.assertEqual([row["path"] for row in checked["assets"]], [self.token("root.mp4")])

    def test_symlink_or_junction_escape_and_cycles_cannot_leave_grant(self):
        links = []
        try:
            os.symlink(self.outside, self.root / "outside-link", target_is_directory=True)
            os.symlink(self.root, self.root / "cycle-link", target_is_directory=True)
            links = [self.root / "outside-link", self.root / "cycle-link"]
        except OSError:
            if os.name != "nt":
                self.skipTest("directory links unavailable")
            for name, target in (("outside-link", self.outside), ("cycle-link", self.root)):
                link = self.root / name
                self.assertTrue(FolderPaths.is_within_directory(self.base, target))
                result = subprocess.run(["cmd", "/d", "/c", "mklink", "/J", str(link), str(target)], capture_output=True)
                if result.returncode:
                    self.skipTest("isolated junction creation unavailable")
                links.append(link)
        self.addCleanup(lambda: [os.rmdir(link) if os.name == "nt" and not link.is_symlink() else link.unlink()
                                 for link in links if link.exists()])
        answer = folders.listing(self.registry, self.grant, "image", "")
        self.assertNotIn("outside-link", [row["name"] for row in answer["folders"]])
        with self.assertRaises(folders.FolderError):
            folders.listing(self.registry, self.grant, "image", "outside-link")
        self.assertEqual(folders.metadata(self.registry, [self.token("outside-link/escape.png")], "image")["assets"], [])
        cycle = folders.listing(self.registry, self.grant, "image", "cycle-link")
        self.assertLess(len(cycle["folders"]), 20)
        self.assertEqual((self.outside / "escape.png").read_bytes(), b"outside-original")

    def test_original_security_import_chooser_and_legacy_listing_bodies_unchanged(self):
        latest = ast.parse(Path(folders.__file__).read_text(encoding="utf-8"))
        before = ast.parse(Path(original.__file__).read_text(encoding="utf-8"))
        current = {node.name: node for node in latest.body if isinstance(node, ast.FunctionDef)}
        for old in [node for node in before.body if isinstance(node, ast.FunctionDef)]:
            new = current[old.name]
            if old.name == "listing":
                self.assertEqual(ast.dump(ast.Module(body=new.body[1:], type_ignores=[])),
                                 ast.dump(ast.Module(body=old.body, type_ignores=[])))
            else:
                self.assertEqual(ast.dump(new), ast.dump(old), old.name)


if __name__ == "__main__":
    unittest.main(verbosity=2)
