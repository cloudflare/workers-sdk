export async function onRequest() {
	return new Response(`[/functions/date]: ${new Date().toISOString()}`);
}
