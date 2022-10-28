export async function onRequest() {
	return new Response("[/functions/greeting/hello]: Bonjour le monde!");
}
