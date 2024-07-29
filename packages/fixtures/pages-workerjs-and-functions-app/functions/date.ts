export async function onRequest() {
	return new Response(new Date().toISOString());
}
