import { reduceError } from "../reduce";

export function createErrorResponse() {
	const error = new TypeError("Dependency error");
	return Response.json(reduceError(error), {
		status: 500,
		headers: { "MF-Experimental-Error-Stack": "true" },
	});
}
