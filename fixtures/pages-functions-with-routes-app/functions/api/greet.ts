export async function onRequestPost(context) {
	try {
		let data = await context.request.json();
		return new Response(`[/functions/api/greet]: ${data.greeting}`);
	} catch (err) {
		return new Response("Error parsing JSON content", { status: 400 });
	}
}
