from workers import Response, handler
from uuid import uuid4
from urllib.parse import urlparse

@handler
async def on_fetch(request, env):
    url = urlparse(request.url)
    if url.path == '/message':
        return Response('Hello, World!')
    if url.path == '/random':
        return Response(uuid4())
    return Response('Not Found', status=404)