// DO NOT IMPORT THIS DIRECTLY
import "__ENTRY_POINT__"; // inside this worker, our user will call addEventListener/swAssetHandlerAddEventListener and register theur fetch listeneers

// We create an event listener for fetch events as user defined listeners have been intercepted
globalThis.addEventListener("fetch", handleFetchEvent);

function handleFetchEvent(event: FetchEvent) {
	event.respondWith(
		(async () => {
			return new Promise((resolve, reject) => {
				// Parse the url to get the path
				const url = new URL(event.request.url);
				const path = url.pathname;
				if (path.endsWith("/___scheduled")) {
					// If triggered at specific URL, we want to convert fetch events to scheduled events.

					// Because we trigger using a fetch event,
					// we need to manually trigger the scheduled event,

					// We check to see if we have a cron param in the url
					const cron = url.searchParams.get("cron");
					const schEvt = {
						...event,
						...(cron ? { cron } : {}),
						type: "scheduled",
						waitUntil() {
							// and return a response as it was triggered from a fetch event
							resolve(new Response("Successfully ran scheduled event"));
						},
					};

					if (globalThis.__inner_sw_scheduled_listeners__.length > 0) {
						for (const listener of globalThis.__inner_sw_scheduled_listeners__) {
							listener(schEvt);
						}
					} else {
						// We have no scheduled listeners on thsi worker, so we'll just return a response
						resolve(
							new Response("No scheduled listeners found", { status: 404 })
						);
					}
				} else {
					// Not triggered at the specific URL,
					// so we just pass the fecth event through to the worker

					const evt = {
						...event,
						respondWith(response: Response) {
							resolve(response);
						},
					};

					if (globalThis.__inner_sw_fetch_listeners__.length > 0) {
						for (const listener of globalThis.__inner_sw_fetch_listeners__) {
							listener(evt);
						}
					} else {
						// We have no fetch listeners on this worker, so we'll just return a response
						resolve(new Response("No fetch listeners found", { status: 404 }));
					}
				}
			});
		})()
	);
}
