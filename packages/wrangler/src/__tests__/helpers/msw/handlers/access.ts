import { http, HttpResponse } from "msw";

export default [
	http.get(
		"*access-protected.com*",
		() => {
			return new HttpResponse(null, {
				status: 302,
				headers: {
					Location: "access-protected-com.cloudflareaccess.com",
				},
			});
		},
		{ once: true }
	),
	http.get(
		"*not-access-protected.com*",
		() => {
			return HttpResponse.text("OK");
		},
		{ once: true }
	),
];
