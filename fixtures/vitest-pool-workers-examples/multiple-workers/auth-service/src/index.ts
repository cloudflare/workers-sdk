import { importSPKI, jwtVerify } from "jose";

export default (<ExportedHandler<Env>>{
	async fetch(request, env, ctx) {
		if (request.method !== "POST") {
			return new Response("Method Not Allowed", { status: 405 });
		}

		const { pathname } = new URL(request.url);
		if (pathname === "/login") {
			// Forward login request to upstream service mocked in test.
			const formData = await request.formData();
			const username = formData.get("username");
			const password = formData.get("password");
			if (typeof username !== "string" || typeof password !== "string") {
				return new Response("Bad Request", { status: 400 });
			}
			return fetch("https://example.com/login", {
				method: "POST",
				body: JSON.stringify({ username, password }),
			});
		} else if (pathname === "/verify") {
			// Verify token with public key
			const authHeader = request.headers.get("Authorization");
			if (!authHeader?.startsWith("Bearer ")) {
				return new Response("Unauthorized", { status: 401 });
			}
			const token = authHeader.substring("Bearer ".length);

			const alg = "RS256";
			const publicKey = await importSPKI(env.AUTH_PUBLIC_KEY, alg);
			try {
				const { payload } = await jwtVerify(token, publicKey, {
					issuer: "urn:example:issuer",
					audience: "urn:example:audience",
				});
				return Response.json(payload);
			} catch {
				return new Response("Unauthorized", { status: 401 });
			}
		} else {
			return new Response("Not Found", { status: 404 });
		}
	},
});
