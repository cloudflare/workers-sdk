import type { Middleware } from "./common";

// A middleware has to be a function of type Middleware
const scheduled: Middleware = async (request, env, _ctx, middlewareCtx) => {
	const url = new URL(request.url);
	if (url.pathname === "/__scheduled") {
		const cron = url.searchParams.get("cron") ?? "";
		await middlewareCtx.dispatch("scheduled", { cron });

		return new Response("Ran scheduled event");
	}

	const resp = await middlewareCtx.next(request, env);

	// If you open the `/__scheduled` page in a browser, the browser will automatically make a request to `/favicon.ico`.
	// For scheduled Workers _without_ a fetch handler, this will result in a 500 response that clutters the log with unhelpful error messages.
	// To avoid this, inject a 404 response to favicon.ico loads on the `/__scheduled` page
	if (
		request.headers.get("referer")?.endsWith("/__scheduled") &&
		url.pathname === "/favicon.ico" &&
		resp.status === 500
	) {
		return new Response(null, { status: 404 });
	}

	return resp;
};

export default scheduled;
