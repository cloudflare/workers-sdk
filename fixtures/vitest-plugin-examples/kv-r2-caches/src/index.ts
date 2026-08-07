import { handleKVRequest, handleR2Request } from "./helpers";

export default <ExportedHandler<Env>>{
	fetch(request, env, ctx) {
		const url = new URL(request.url);
		if (url.pathname.startsWith("/kv/")) {
			return handleKVRequest(request, env);
		} else if (url.pathname.startsWith("/r2/")) {
			return handleR2Request(request, env, ctx);
		} else {
			return new Response("Not Found", { status: 404 });
		}
	},
};
