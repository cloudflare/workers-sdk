addEventListener("fetch", (event) => {
	event.respondWith(new Response("Hello from service worker a"));
});
