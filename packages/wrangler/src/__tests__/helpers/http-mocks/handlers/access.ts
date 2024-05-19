import { http, HttpResponse } from "msw";

export default [
	http.get("*access-protected.com*", (_, response, cxt) => {
		return response.once(
			cxt.status(302),
			cxt.set("location", "access-protected-com.cloudflareaccess.com")
		);
	}),
	http.get("*not-access-protected.com*", (_, response, cxt) => {
		return response.once(cxt.status(200), cxt.body("OK"));
	}),
];
