import text from "./../external-modules/meaning-of-life.txt";

export async function onRequest() {
	return new Response(text, {
		headers: { "Content-Type": "text/plain" },
	});
}
