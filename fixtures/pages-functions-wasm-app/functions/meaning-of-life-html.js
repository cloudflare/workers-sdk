import html from "./../external-modules/meaning-of-life.html";

export async function onRequest() {
	return new Response(html, {
		headers: { "Content-Type": "text/html" },
	});
}
