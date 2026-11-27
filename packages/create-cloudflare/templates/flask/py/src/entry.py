from flask import Flask
from workers import WorkerEntrypoint, wsgi

app = Flask(__name__)


@app.get("/")
def root():
    return "Hello from Flask on Cloudflare Workers!"


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        return await wsgi.fetch(app, request, self.env)
