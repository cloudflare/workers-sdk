from workers import Response, WorkerEntrypoint

class Default(WorkerEntrypoint):
    async def fetch(self, request, env):
        return Response("Hello World!")
