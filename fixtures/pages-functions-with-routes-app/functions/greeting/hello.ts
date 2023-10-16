export async function onRequest(context) {
	const url = new URL(context.request.url);

	const response = await fetch(`${url.origin}/api/greet`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ greeting: "Bonjour le monde!" }),
	});

	return new Response(`[/functions/greeting/hello]: ${await response.text()}`);
}
