from js import Response, URL, crypto

async def on_fetch(request, env):
	url = URL.new(request.url)
	if url.pathname == '/message':
		return Response.new('Hello, World!')
	if url.pathname == '/random':
		return Response.new(crypto.randomUUID())
	return Response.new('Not Found', {'status': 404})
