declare const SERVICE: Fetcher;

addEventListener("fetch", (event) => {
	event.respondWith(SERVICE.fetch(event.request));
});
