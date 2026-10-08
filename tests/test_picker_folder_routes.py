"""Actual folder route handlers/guards, with only server/decoder seams stubbed."""

import asyncio
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

import layout
from test_picker_external_folders import F, Paths, pkg

handlers = layout.stub_server()
instance = sys.modules["server"].PromptServer.instance


class Request:
    def __init__(self, body=None, query=None, headers=None, remote="127.0.0.1"):
        self.body = body or {}
        self.query = query or {}
        self.headers = {"Content-Type": "application/json", "Host": "localhost:8188", **(headers or {})}
        self.remote = remote

    async def json(self):
        return self.body

    def clone(self, headers):
        return Request(self.body, self.query, headers, self.remote)


class Users:
    def __init__(self, root):
        self.root = root

    def get_request_user_id(self, request):
        user = request.headers.get("comfy-user", "default")
        if user not in ("default", "alice"):
            raise KeyError("unknown user")
        return user

    def get_request_user_filepath(self, request, filename, create_dir=False):
        return str(self.root / self.get_request_user_id(request) / filename)


stub_routes = types.ModuleType("mmc_picker_folders.server_routes")
stub_routes._read_header = lambda path: {"has_audio": False, "duration": None, "width": 20, "height": 10}
stub_routes._query_crop = lambda crop: None
stub_preview = types.ModuleType("mmc_picker_folders.preview")


async def no_thumb(*args, **kwargs):
    return None


stub_preview.thumbnail = no_thumb
stub_preview.waveform = no_thumb
sys.modules[stub_routes.__name__] = pkg.server_routes = stub_routes
sys.modules[stub_preview.__name__] = pkg.preview = stub_preview
spec = importlib.util.spec_from_file_location("mmc_picker_folders.routes.folders", layout.PY_ROOT + "/routes/folders.py")
routes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(routes)


def call(action, request):
    return asyncio.run(handlers["/continuity/folders/" + action](request))


def body(response):
    return json.loads(response.body)


class RouteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        self.source.mkdir()
        (self.source / "photo.png").write_bytes(b"original")
        Paths.input = str(self.root / "input")
        Path(Paths.input).mkdir()
        instance.user_manager = Users(self.root / "users")
        self.filename = instance.user_manager.get_request_user_filepath(Request(), F.FILE)
        self.grant = F.register(self.filename, str(self.source))
        self.token = f"external:{self.grant['id']}/photo.png"

    def test_post_guard_blocks_simple_and_cross_origin_requests(self):
        for headers, status in [({"Content-Type": "text/plain"}, 415), ({"Origin": "https://bad.example"}, 403)]:
            with patch.object(F, "choose") as chooser:
                self.assertEqual(call("choose", Request(headers=headers)).status, status)
                chooser.assert_not_called()

    def test_native_chooser_rejects_remote_client_before_spawning(self):
        with patch.object(F, "choose") as chooser:
            self.assertEqual(call("choose", Request(remote="192.168.1.20")).status, 403)
            chooser.assert_not_called()

    def test_native_cancel_and_success_only_register_chosen_directory(self):
        with patch.object(F, "choose", return_value=None):
            self.assertEqual(body(call("choose", Request())), {"folder": None})
        with patch.object(F, "choose", return_value=str(self.source)):
            self.assertEqual(body(call("choose", Request({"path": "C:/ignored-user-input"})))["folder"], self.grant)

    def test_list_and_selected_folder_endpoint_use_current_user(self):
        self.assertEqual(body(call("list", Request()))["folders"], [self.grant])
        self.assertEqual(body(call("list", Request(headers={"comfy-user": "alice"})))["folders"], [])
        rows = body(call("assets", Request({"folder": self.grant["id"], "kind": "image"})))["assets"]
        self.assertEqual([row["path"] for row in rows], [self.token])
        self.assertEqual(call("assets", Request({"folder": self.grant["id"], "kind": "image"},
                                                  headers={"comfy-user": "alice"})).status, 400)

    def test_media_guards_block_cross_site_and_unregistered_path(self):
        self.assertEqual(call("view", Request(query={"filename": self.token},
                                               headers={"Sec-Fetch-Site": "cross-site"})).status, 403)
        for token in ["C:/private/photo.png", self.token + "/../../private.txt"]:
            self.assertEqual(call("view", Request(query={"filename": token})).status, 404)

    def test_media_user_selector_requires_that_users_random_grant(self):
        request = Request(headers={"comfy-user": "alice"})
        filename = instance.user_manager.get_request_user_filepath(request, F.FILE)
        alice = F.register(filename, str(self.source))
        token = f"external:{alice['id']}/photo.png"
        self.assertEqual(call("view", Request(query={"filename": token})).status, 404)
        response = call("view", Request(query={"filename": token, "user": "alice"},
                                         headers={"Sec-Fetch-Site": "same-origin"}))
        self.assertEqual(response.status, 200)
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")

    def test_import_canonicalizes_only_selected_files_and_preserves_options(self):
        response = call("import", Request({"assets": [{"path": self.token, "takes": "person", "ref_size": "match"},
                                                        {"path": "already.png"}]}))
        rows = body(response)["assets"]
        self.assertEqual(rows[1], {"path": "already.png"})
        self.assertEqual((rows[0]["takes"], rows[0]["ref_size"]), ("person", "match"))
        self.assertEqual(Path(Paths.input, rows[0]["path"]).read_bytes(), b"original")
        self.assertEqual((self.source / "photo.png").read_bytes(), b"original")

    def test_remove_registry_only_and_reveal_returns_path_without_real_window(self):
        with patch.object(routes.subprocess, "Popen") as process, patch.object(routes.assets, "reveal_command", lambda path: ["fake", path]):
            self.assertEqual(body(call("reveal", Request({"folder": self.grant["id"]})))["path"], str(self.source))
            process.assert_called_once()
        self.assertEqual(call("remove", Request({"folder": self.grant["id"]})).status, 200)
        self.assertTrue((self.source / "photo.png").exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
