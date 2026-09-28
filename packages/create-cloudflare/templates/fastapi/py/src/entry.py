from fastapi import FastAPI
from workers import WorkerEntrypoint, asgi

app = FastAPI()


@app.get("/")
async def root():
    return {"message": "Hello from FastAPI on Cloudflare Workers!"}


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        return await asgi.fetch(app, request, self.env)
