import { reduceError } from "./reduce";

export default (<ExportedHandler<{ MESSAGE: string }>>{
	fetch(request, env) {
		const error = new Error(env.MESSAGE);
		return Response.json(reduceError(error), {
			status: 500,
			headers: { "MF-Experimental-Error-Stack": "true" },
		});
	},
});
