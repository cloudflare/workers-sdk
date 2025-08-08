async function handler(request) {
	console.log("<<<<<this is a log>>>>>");
	console.warn("<<<<<this is a warning>>>>>");
	console.error("<<<<<this is an error>>>>>");
	console.debug("<<<<<this is a debug message>>>>>");
	console.info("<<<<<this is an info message>>>>>");
	return new Response("Hello");
}

addEventListener("fetch", (event) => {
	event.respondWith(handler(event.request));
});
