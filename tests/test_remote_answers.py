"""Remote answer receipts with fake server/queue only: no ComfyUI or models."""

import ast
import asyncio
import importlib.util
import json
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


class Response:
    def __init__(self, body, status=200, headers=None):
        self.body, self.status, self.headers = body, status, headers or {}


class Request:
    def __init__(self, body, headers=None, invalid=False):
        self.body, self.invalid, self.reads = body, invalid, 0
        self.headers = headers or {"Content-Type": "application/json", "Host": "localhost:8188", "Origin": "http://localhost:8188"}

    async def json(self):
        self.reads += 1
        if self.invalid:
            raise ValueError("not JSON")
        return self.body


class Routes:
    def __init__(self):
        self.registered = {}

    def post(self, path):
        def decorate(function):
            self.registered[path] = function
            return function
        return decorate


def load():
    sent, routes = [], Routes()
    server = types.ModuleType("server")
    server.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(
        routes=routes, send_sync=lambda *args: sent.append(args)))
    sys.modules["server"] = server
    web = types.ModuleType("aiohttp.web")
    web.json_response = lambda body, status=200, headers=None: Response(body, status, headers)
    aiohttp = types.ModuleType("aiohttp")
    aiohttp.web = web
    sys.modules["aiohttp"] = aiohttp
    sys.modules["aiohttp.web"] = web
    package = types.ModuleType("mmc_remote")
    package.__path__ = [str(ROOT / "creator")]
    sys.modules["mmc_remote"] = package
    route_package = types.ModuleType("mmc_remote.routes")
    route_package.__path__ = [str(ROOT / "creator/routes")]
    sys.modules["mmc_remote.routes"] = route_package

    def module(name, relative):
        spec = importlib.util.spec_from_file_location(name, ROOT / relative)
        result = importlib.util.module_from_spec(spec)
        sys.modules[name] = result
        spec.loader.exec_module(result)
        return result

    jobs = module("mmc_remote.jobs", "creator/jobs.py")
    package.jobs = jobs
    module("mmc_remote.guard", "creator/guard.py")
    answers = module("mmc_remote.routes.answers", "creator/routes/answers.py")
    return jobs, answers, sent, web


async def drain(jobs):
    while jobs._answering:
        await asyncio.gather(*jobs._answering)


def route_function(relative, name, namespace):
    """Execute the actual route body with its model/server dependencies faked."""
    tree = ast.parse((ROOT / relative).read_text(encoding="utf-8"))
    function = next(node for node in tree.body if isinstance(node, ast.AsyncFunctionDef) and node.name == name)
    function.decorator_list = []
    exec(compile(ast.Module(body=[function], type_ignores=[]), str(ROOT / relative), "exec"), namespace)
    return namespace[name]


class Refused(ValueError):
    pass


class RemoteAnswers(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.jobs, self.answers, self.sent, self.web = load()

    async def asyncTearDown(self):
        await drain(self.jobs)

    def start(self, work=lambda: {"text": "rewritten"}, client="tab-a", expected=()):
        answer_id = self.jobs.answer_later(work, client, expected)
        return self.jobs.answer_ticket(answer_id)

    def status(self, ticket, acknowledge=False):
        return self.jobs.answer_status(ticket["answer_id"], ticket["answer_token"], acknowledge)

    async def test_ticket_precedes_work_and_pending_reads_do_not_consume_or_repeat(self):
        calls = []
        ticket = self.start(lambda: calls.append("run") or {"text": "one result"})
        self.assertEqual(calls, [])
        self.assertEqual(self.status(ticket), {"status": "pending"})
        self.assertEqual(self.status(ticket), {"status": "pending"})
        await drain(self.jobs)
        first = self.status(ticket)
        self.assertEqual(first, {"status": "complete", "prompt_id": ticket["answer_id"], "result": {"text": "one result"}})
        self.assertEqual(self.status(ticket), first)
        self.assertEqual(calls, ["run"])

    async def test_cached_before_socket_send_and_targeted_to_requesting_tab(self):
        during_send = []
        ticket = self.start()
        self.jobs.PromptServer.instance.send_sync = lambda event, message, client: during_send.append((event, message, client, self.status(ticket)))
        await drain(self.jobs)
        event, message, client, cached = during_send[0]
        self.assertEqual(event, "mmc_answer")
        self.assertEqual(client, "tab-a")
        self.assertEqual(cached, {"status": "complete", **message})

    async def test_socket_delivery_failure_still_leaves_recoverable_result(self):
        def disconnected(*args):
            raise OSError("socket is disconnected")
        self.jobs.PromptServer.instance.send_sync = disconnected
        ticket = self.start()
        with self.assertLogs(self.jobs.log, level="WARNING"):
            await drain(self.jobs)
        self.assertEqual(self.status(ticket)["result"], {"text": "rewritten"})
        self.assertFalse(self.jobs._answering)

    async def test_expected_error_is_recovered_without_type_prefix(self):
        def refuse():
            raise Refused("remote request refused")
        ticket = self.start(refuse, expected=(Refused,))
        await drain(self.jobs)
        self.assertEqual(self.status(ticket)["error"], "remote request refused")
        self.assertEqual(self.sent[0][1]["error"], "remote request refused")

    async def test_unexpected_error_retains_original_type_prefix(self):
        def broken():
            raise KeyError("model")
        ticket = self.start(broken)
        with self.assertLogs(self.jobs.log, level="ERROR"):
            await drain(self.jobs)
        self.assertEqual(self.status(ticket)["error"], "KeyError: 'model'")

    async def test_cancel_before_delivery_starts_is_terminal_and_does_not_run_work(self):
        calls = []
        ticket = self.start(lambda: calls.append("run"))
        task = next(iter(self.jobs._answering))
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        await asyncio.sleep(0)
        self.assertTrue(task.cancelled())
        self.assertEqual(calls, [])
        self.assertEqual(self.status(ticket), {"status": "complete", "prompt_id": ticket["answer_id"], "error": "cancelled", "cancelled": True})
        self.assertFalse(self.jobs._answering)

    async def test_cancel_while_work_is_waiting_is_recoverable_terminal_error(self):
        loop = asyncio.get_running_loop()
        waiting = loop.create_future()
        with patch.object(loop, "run_in_executor", lambda *args: waiting):
            ticket = self.start()
            await asyncio.sleep(0)
            task = next(iter(self.jobs._answering))
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            await asyncio.sleep(0)
        self.assertEqual(self.status(ticket)["error"], "cancelled")
        self.assertTrue(self.status(ticket)["cancelled"])

    async def test_receipt_is_required_and_does_not_leak_in_messages_or_results(self):
        ticket = self.start()
        for invalid in (None, 2, [], "wrong", "한글"):
            self.assertIsNone(self.jobs.answer_status(ticket["answer_id"], invalid))
        self.assertIsNone(self.jobs.answer_status("unknown", ticket["answer_token"]))
        await drain(self.jobs)
        self.assertNotIn("answer_token", self.status(ticket))
        self.assertNotIn(ticket["answer_token"], json.dumps(self.sent))

    async def test_concurrent_tickets_cannot_read_or_ack_each_other(self):
        first, second = self.start(lambda: "first"), self.start(lambda: "second", client="tab-b")
        self.assertNotEqual(first["answer_id"], second["answer_id"])
        self.assertNotEqual(first["answer_token"], second["answer_token"])
        await drain(self.jobs)
        self.assertIsNone(self.jobs.answer_status(first["answer_id"], second["answer_token"], True))
        self.assertEqual(self.status(first)["result"], "first")
        self.assertEqual(self.status(second)["result"], "second")

    async def test_ack_only_releases_completed_answer(self):
        ticket = self.start()
        self.assertEqual(self.status(ticket, True), {"status": "pending"})
        await drain(self.jobs)
        self.assertEqual(self.status(ticket, True), {"status": "acknowledged"})
        self.assertIsNone(self.status(ticket))

    async def test_completed_ttl_does_not_expire_pending_work(self):
        self.jobs.ANSWER_TTL = 0
        ticket = self.start()
        self.assertEqual(self.status(ticket), {"status": "pending"})
        await drain(self.jobs)
        self.assertIsNone(self.status(ticket))

    async def test_capacity_refuses_new_work_without_evicting_pending(self):
        self.jobs.ANSWER_LIMIT = 1
        calls = []
        ticket = self.start(lambda: calls.append("first") or 1)
        with self.assertRaises(self.jobs.JobError):
            self.start(lambda: calls.append("refused"))
        self.assertEqual(self.status(ticket), {"status": "pending"})
        await drain(self.jobs)
        self.assertEqual(calls, ["first"])
        self.assertEqual(self.status(ticket)["result"], 1)

    async def test_ack_and_expiry_make_capacity_available(self):
        self.jobs.ANSWER_LIMIT = 1
        first = self.start()
        await drain(self.jobs)
        self.status(first, True)
        second = self.start()
        await drain(self.jobs)
        self.jobs.ANSWER_TTL = 0
        third = self.start()
        self.assertEqual(self.status(third), {"status": "pending"})
        self.assertIsNone(self.status(second))

    async def test_result_null_remains_a_completed_result(self):
        ticket = self.start(lambda: None)
        await drain(self.jobs)
        self.assertEqual(self.status(ticket), {"status": "complete", "prompt_id": ticket["answer_id"], "result": None})

    async def test_store_has_no_request_or_provider_credentials(self):
        ticket = self.start()
        self.assertEqual(set(self.jobs._answers[ticket["answer_id"]]), {"token", "message", "finished"})
        await drain(self.jobs)
        self.assertEqual(set(self.jobs._answers[ticket["answer_id"]]), {"token", "message", "finished"})

    async def test_lookup_route_returns_no_store_and_safe_repeat_reads(self):
        ticket = self.start()
        response = await self.answers.remote_answer(Request(ticket))
        self.assertEqual(response.body, {"status": "pending"})
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        await drain(self.jobs)
        first = await self.answers.remote_answer(Request(ticket))
        second = await self.answers.remote_answer(Request(ticket))
        self.assertEqual(first.body, second.body)
        self.assertEqual(first.body["status"], "complete")

    async def test_missing_wrong_and_expired_lookup_have_same_404(self):
        ticket = self.start()
        await drain(self.jobs)
        wrong = await self.answers.remote_answer(Request({**ticket, "answer_token": "wrong"}))
        missing = await self.answers.remote_answer(Request({"answer_id": "unknown", "answer_token": "wrong"}))
        self.jobs.ANSWER_TTL = 0
        expired = await self.answers.remote_answer(Request(ticket))
        self.assertEqual((wrong.status, missing.status, expired.status), (404, 404, 404))
        self.assertEqual(wrong.body, missing.body)
        self.assertEqual(wrong.body, expired.body)

    async def test_ack_route_does_not_delete_pending_but_deletes_complete(self):
        ticket = self.start()
        pending = await self.answers.remote_answer(Request({**ticket, "ack": True}))
        self.assertEqual(pending.body, {"status": "pending"})
        await drain(self.jobs)
        acknowledged = await self.answers.remote_answer(Request({**ticket, "ack": True}))
        self.assertEqual(acknowledged.body, {"status": "acknowledged"})
        self.assertEqual((await self.answers.remote_answer(Request(ticket))).status, 404)

    async def test_cross_origin_and_simple_requests_rejected_before_body_read(self):
        cross = Request({}, headers={"Content-Type": "application/json", "Host": "localhost:8188", "Origin": "https://elsewhere.invalid"})
        simple = Request({}, headers={"Content-Type": "text/plain", "Host": "localhost:8188"})
        self.assertEqual((await self.answers.remote_answer(cross)).status, 403)
        self.assertEqual((await self.answers.remote_answer(simple)).status, 415)
        self.assertEqual((cross.reads, simple.reads), (0, 0))

    async def test_lookup_invalid_json_and_nonobject_refused(self):
        for request in (Request({}, invalid=True), Request([])):
            response = await self.answers.remote_answer(request)
            self.assertEqual(response.status, 400)
            self.assertEqual(response.headers["Cache-Control"], "no-store")

    def route_namespace(self):
        return {"asyncio": asyncio, "jobs": self.jobs, "web": self.web,
                "refine": types.SimpleNamespace(RefineError=Refused),
                "chat": types.SimpleNamespace(ActionError=Refused),
                "compiler": types.SimpleNamespace(CompileError=Refused),
                "media": types.SimpleNamespace(MediaError=Refused), "_no_model": lambda block: None}

    async def test_actual_refine_route_preserves_field_payload_and_returns_receipt(self):
        body = {"backend": "remote", "model": "mock", "client_id": "tab-a", "kind": "field", "field": "summary", "reference_images": False, "skill": "faithful-beta"}
        observed = []
        namespace = self.route_namespace()
        namespace["_run"] = lambda value: observed.append(value) or {"field": value["field"]}
        route = route_function("creator/refine_routes.py", "refine_prompt", namespace)
        response = await route(Request(body))
        self.assertEqual(set(response.body), {"answer_id", "answer_token"})
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        await drain(self.jobs)
        self.assertEqual(observed, [body])
        self.assertEqual(self.status(response.body)["result"], {"field": "summary"})

    async def test_actual_chat_turn_route_returns_recoverable_same_shape(self):
        namespace = self.route_namespace()
        namespace["_run"] = lambda body: {"say": "reply", "raw": "mock"}
        route = route_function("creator/routes/chat.py", "chat_turn", namespace)
        response = await route(Request({"settings": {"backend": "remote"}, "client_id": "tab-a"}))
        await drain(self.jobs)
        self.assertEqual(self.status(response.body)["result"], {"say": "reply", "raw": "mock"})

    async def test_actual_chat_again_keeps_inline_when_no_caption_needed(self):
        namespace = self.route_namespace()
        namespace["_again"] = lambda *args: {"kind": "still", "prompt": "same caption"}
        route = route_function("creator/routes/chat.py", "chat_again", namespace)
        response = await route(Request({"settings": {"backend": "remote"}}))
        self.assertEqual(response.body, {"result": {"action": {"kind": "still", "prompt": "same caption"}}})
        self.assertFalse(self.jobs._answers)

    async def test_actual_chat_again_caption_uses_receipt(self):
        namespace = self.route_namespace()
        namespace["_again"] = lambda body, *args: None if args else {"kind": "still", "caption": "new caption"}
        route = route_function("creator/routes/chat.py", "chat_again", namespace)
        response = await route(Request({"settings": {"backend": "remote"}}))
        await drain(self.jobs)
        self.assertEqual(self.status(response.body)["result"], {"action": {"kind": "still", "caption": "new caption"}})

    async def test_capacity_returns_503_from_all_actual_remote_routes(self):
        self.jobs.ANSWER_LIMIT = 0
        for relative, name, body in (("creator/refine_routes.py", "refine_prompt", {"backend": "remote", "model": "mock"}),
                                     ("creator/routes/chat.py", "chat_turn", {"settings": {"backend": "remote"}}),
                                     ("creator/routes/chat.py", "chat_again", {"settings": {"backend": "remote"}})):
            namespace = self.route_namespace()
            namespace["_run"] = lambda body: self.fail("refused work must not execute")
            namespace["_again"] = lambda *args: None
            route = route_function(relative, name, namespace)
            response = await route(Request(body))
            self.assertEqual(response.status, 503)
        self.assertFalse(self.jobs._answers)

    async def test_actual_local_refine_and_chat_still_submit_gpu_queue(self):
        submitted = []
        async def submit(kind, body, client):
            submitted.append((kind, body, client))
            return "queued-local"
        self.jobs.submit = submit
        for relative, name, body in (("creator/refine_routes.py", "refine_prompt", {"backend": "local", "model": "mock", "client_id": "tab-a"}),
                                     ("creator/routes/chat.py", "chat_turn", {"settings": {"backend": "local"}, "client_id": "tab-a"})):
            route = route_function(relative, name, self.route_namespace())
            response = await route(Request(body))
            self.assertEqual(response.body, {"prompt_id": "queued-local"})
        self.assertEqual([entry[0] for entry in submitted], ["refine", "chat"])
        self.assertFalse(self.jobs._answers)

    async def test_new_route_is_registered_by_package_entrypoint(self):
        self.assertIn("/continuity/answers", self.jobs.PromptServer.instance.routes.registered)
        source = (ROOT / "__init__.py").read_text(encoding="utf-8")
        tree = ast.parse(source)
        self.assertTrue(any(isinstance(node, ast.ImportFrom) and node.module == "creator.routes" and any(alias.name == "answers" for alias in node.names) for node in tree.body))


if __name__ == "__main__":
    unittest.main(verbosity=2)
