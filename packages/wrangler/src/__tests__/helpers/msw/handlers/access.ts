import { http, HttpResponse } from "msw";

export default [
	http.get("https://access-protected.com/", () => {
		return HttpResponse.json(null, {
			status: 302,
			headers: { location: "access-protected-com.cloudflareaccess.com" },
		});
	}),
	http.get("https://not-access-protected.com/", () => {
		return HttpResponse.json("OK", { status: 200 });
	}),
];
