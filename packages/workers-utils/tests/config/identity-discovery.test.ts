import { it } from "vitest";
import { isIdentityBinding } from "../../src/config/oidc";
it("accepts trusted issuer-only setup, abstract resource indicators and shared delivery rules", ({
	expect,
}) => {
	const oauth = {
		exchange: "client_credentials",
		client_id: "client",
		authorization_server: "https://auth.example/tenant",
		resource: "urn:example:orders",
		scope: ["read"],
		resources: [{ url: "https://api.example/orders", methods: ["GET"] }],
	};
	expect(isIdentityBinding({ binding: "API", oauth })).toBe(true);
	expect(
		isIdentityBinding({
			binding: "API",
			oauth: { ...oauth, token_endpoint: null },
		})
	).toBe(false);
	expect(
		isIdentityBinding({
			binding: "API",
			oauth: {
				...oauth,
				allowed_origins: ["https://api.example"],
				allowed_methods: ["GET"],
			},
		})
	).toBe(false);
	expect(
		isIdentityBinding({ binding: "API", client_authentication: true })
	).toBe(false);
	expect(
		isIdentityBinding({
			binding: "API",
			client_authentication: {
				client_id: "client",
				audience: "urn:example:authorization-server",
			},
		})
	).toBe(true);
});
