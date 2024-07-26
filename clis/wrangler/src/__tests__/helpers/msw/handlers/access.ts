import { http, HttpResponse } from "msw";

export default [
	http.get(
		"*access-protected.com*",
		() => {
			return HttpResponse.json(null, {
				status: 302,
				headers: { location: "access-protected-com.cloudflareaccess.com" },
			});
		},
		{ once: true }
	),
	http.get(
		"*not-access-protected.com*",
		() => {
			return HttpResponse.json("OK", { status: 200 });
		},
		{ once: true }
	),
];
