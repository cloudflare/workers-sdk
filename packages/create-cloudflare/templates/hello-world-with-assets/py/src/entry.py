from workers import Response, WorkerEntrypoint
from uuid import uuid4
from urllib.parse import urlparse

class Default(WorkerEntrypoint):
    async def fetch(self, request):
        url = urlparse(request.url)
        if url.path == '/message':
            return Response('Hello, World!')
        if url.path == '/random':
            return Response(uuid4())
        return Response('Not Found', status=404)