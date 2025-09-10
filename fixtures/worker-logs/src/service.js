async function handler(request) {
	console.log("<<<<< console.log() message >>>>>");
	console.warn("<<<<< console.warning() message >>>>>");
	console.error("<<<<< console.error() message >>>>>");
	console.debug("<<<<< console.debug() message >>>>>");
	console.info("<<<<< console.info() message >>>>>");
	return new Response("Hello");
}

addEventListener("fetch", (event) => {
	event.respondWith(handler(event.request));
});
