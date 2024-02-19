import { reduceError } from "./reduce";

declare const MESSAGE: string;

addEventListener("fetch", (event) => {
	const error = new Error(MESSAGE);
	event.respondWith(
		Response.json(reduceError(error), {
			status: 500,
			headers: { "MF-Experimental-Error-Stack": "true" },
		})
	);
});
