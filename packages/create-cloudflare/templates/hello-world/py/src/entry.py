from workers import Response, handler

@handler
async def on_fetch(request, env):
    return Response("Hello World!")
