"""Recover a remote answer missed during a temporary socket disconnection.

Only the random receipt returned to the original caller can read its answer.
The table is RAM-only, expires completed entries and never stores credentials.
This route does not start, repeat or cancel model work.
"""

from aiohttp import web
from server import PromptServer

from .. import jobs
from ..guard import same_origin


@PromptServer.instance.routes.post("/continuity/answers")
@same_origin
async def remote_answer(request):
    headers = {"Cache-Control": "no-store"}
    try:
        body = await request.json()
    except ValueError:
        return web.json_response({"error": "the request body was not JSON"}, status=400, headers=headers)
    if not isinstance(body, dict):
        return web.json_response({"error": "the request body was not an object"}, status=400, headers=headers)
    answer = jobs.answer_status(body.get("answer_id"), body.get("answer_token"), body.get("ack") is True)
    if answer is None:
        # Do not reveal whether an id exists to a caller without its receipt.
        return web.json_response({"error": "the remote answer is no longer available"}, status=404, headers=headers)
    return web.json_response(answer, headers=headers)
