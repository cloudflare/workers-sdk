import { http, HttpResponse } from "msw";

export const mswAccessHandlers = [
	http.get("https://access-protected.com/", () => {
		return HttpResponse.json(null, {
			status: 302,
			headers: { location: "access-protected-com.cloudflareaccess.com" },
		});
	}),
	http.get("https://not-access-protected.com/", () => {
		return HttpResponse.json("OK", { status: 200 });
	}),
	// Simulates an Access application configured to only allow Service Auth
	// tokens: the domain is behind Access but responds with a hard 403 instead
	// of redirecting to cloudflareaccess.com, because there is no interactive
	// login path for users.
	http.get("https://access-service-auth-only.com/", () => {
		return HttpResponse.json(null, { status: 403 });
	}),
];
