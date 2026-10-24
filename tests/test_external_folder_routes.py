"""Actual guarded folder handlers over in-memory requests and temporary grants.

No live server/network or chooser/import/probe execution.
"""
import ast
import asyncio
import importlib.util
import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

import layout
from test_external_folders import FolderPaths

package = "external_folder_route_test"
pkg = layout.load("assets", "refmod", "folders", "guard", package=package)
for name in ("preview", "server_routes"):
    module = types.ModuleType(f"{package}.{name}")
    sys.modules[module.__name__] = module
    setattr(pkg, name, module)
handlers = layout.stub_server()
spec = importlib.util.spec_from_file_location(f"{package}.routes.folders", Path(layout.PY_ROOT) / "routes/folders.py")
route = importlib.util.module_from_spec(spec)
spec.loader.exec_module(route)
server = sys.modules["server"].PromptServer.instance


class Request:
    query = {}
    remote = "127.0.0.1"

    def __init__(self, body, user="one", **headers):
        self.body = body
        self.headers = {"Content-Type": "application/json", "Host": "127.0.0.1:8188", "comfy-user": user, **headers}

    async def json(self):
        return self.body


def call(handler, body, **headers):
    response = asyncio.run(handler(Request(body, **headers)))
    return response.status, json.loads(response.text), response.headers


class FolderRoutes(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="continuity-folder-route-")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.root = self.base / "registered"
        self.root.mkdir()
        (self.root / "empty").mkdir()
        (self.root / "nested").mkdir()
        (self.root / "nested/one.png").write_bytes(b"test")
        self.registry = str(self.base / "one.json")
        self.other = str(self.base / "two.json")
        self.grant = pkg.folders.register(self.registry, str(self.root))["id"]
        pkg.folders.save(self.other, [])
        server.user_manager = types.SimpleNamespace(
            get_request_user_filepath=lambda request, _name, create_dir=False: self.registry if request.headers.get("comfy-user") == "one" else self.other,
            get_request_user_id=lambda request: request.headers.get("comfy-user"))

    def test_optional_directory_contract_and_exact_omitted_recursive_response(self):
        status, answer, headers = call(route.folder_assets, {"folder": self.grant, "kind": "image"})
        self.assertEqual(status, 200)
        self.assertEqual(answer, pkg.folders.listing(self.registry, self.grant, "image"))
        self.assertEqual(headers["Cache-Control"], "no-store")
        status, answer, _ = call(route.folder_assets, {"folder": self.grant, "kind": "image", "directory": ""})
        self.assertEqual(status, 200)
        self.assertEqual(answer["assets"], [])
        self.assertEqual([row["directory"] for row in answer["folders"]], ["empty", "nested"])
        self.assertIsNone(answer["parent"])

    def test_directory_request_shape_traversal_missing_file_are_refused(self):
        for body in ([], None, {"directory": None}, {"directory": 4}, {"directory": {}},
                     {"directory": "../outside"}, {"directory": "nested/one.png"}, {"directory": "deleted"}):
            if isinstance(body, dict):
                body = {"folder": self.grant, "kind": "image", **body}
            with self.subTest(body=body):
                self.assertEqual(call(route.folder_assets, body)[0], 400)

    def test_metadata_is_fresh_bounded_ordered_and_never_imports(self):
        token = f"external:{self.grant}/nested/one.png"
        absent = f"external:{self.grant}/nested/deleted.png"
        with patch.object(pkg.folders, "import_file", side_effect=AssertionError("no import")), \
                patch.object(pkg.folders, "_copy", side_effect=AssertionError("no copy")):
            status, answer, headers = call(route.folder_metadata, {"kind": "image", "paths": [token, absent]})
        self.assertEqual(status, 200)
        self.assertEqual(answer["missing"], [absent])
        self.assertEqual(answer["assets"][0]["path"], token)
        self.assertEqual(answer["assets"][0]["size"], 4)
        self.assertEqual(headers["Cache-Control"], "no-store")
        for body in (None, [], {"kind": "image", "paths": None}, {"kind": "image", "paths": [token] * 257},
                     {"kind": "image", "paths": [3]}, {"kind": "unknown", "paths": []}):
            self.assertEqual(call(route.folder_metadata, body)[0], 400)

    def test_same_origin_and_preflight_guard_run_before_filesystem_or_registry(self):
        for handler, body in ((route.folder_assets, {"folder": self.grant, "kind": "image", "directory": ""}),
                              (route.folder_metadata, {"paths": [], "kind": "image"})):
            with patch.object(route, "_registry", side_effect=AssertionError("guard before registry")):
                self.assertEqual(call(handler, body, Origin="http://evil.invalid")[0], 403)
                self.assertEqual(call(handler, body, **{"Content-Type": "text/plain"})[0], 415)

    def test_registered_token_cannot_read_another_users_grant(self):
        token = f"external:{self.grant}/nested/one.png"
        status, answer, _ = call(route.folder_metadata, {"paths": [token], "kind": "image"}, user="two")
        self.assertEqual((status, answer), (200, {"assets": [], "missing": [token]}))
        self.assertEqual(call(route.folder_assets, {"folder": self.grant, "kind": "image", "directory": ""}, user="two")[0], 400)

    def test_new_route_is_registered_and_all_original_handlers_except_listing_are_exact(self):
        self.assertIn("/continuity/folders/metadata", handlers)
        root = Path(os.environ.get("CONTINUITY_BASELINE_DIR", str(Path(layout.ROOT).parent / "baseline")))
        old = ast.parse((root / "creator/routes/folders.py").read_text(encoding="utf-8"))
        latest = ast.parse(Path(route.__file__).read_text(encoding="utf-8"))
        current = {node.name: node for node in latest.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))}
        for node in old.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name != "folder_assets":
                self.assertEqual(ast.dump(current[node.name]), ast.dump(node), node.name)


if __name__ == "__main__":
    unittest.main(verbosity=2)
