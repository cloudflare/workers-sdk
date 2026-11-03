import { isIdentityBinding } from "@cloudflare/workers-utils/oidc";
import { it } from "vitest";
import { bindings } from "../public";
const attachment = {
	connector_id: "a7e6a4e4-6666-4666-8666-123456789abc",
	connector_revision: 1 as const,
	selection: "customer" as const,
	scope: ["read"],
	resources: [{ url: "https://api.example/items", methods: ["GET" as const] }],
};
it("preserves account connector attachment metadata and rejects protected fields", ({
	expect,
}) => {
	expect(bindings.identity(attachment)).toEqual({
		type: "identity",
		...attachment,
	});
	const valid = { binding: "ISSUES", ...attachment };
	expect(isIdentityBinding(valid)).toBe(true);
	for (const extra of [
		{ accountId: "other" },
		{ workerId: "other" },
		{ permissions: {} },
		{ audience: "urn:other" },
		{ connector_revision: 0 },
		{ selection: "worker" },
		{ scope: ["read write"] },
		{
			inspection_resources: [{ url: "https://evil.example", methods: ["GET"] }],
		},
	])
		expect(isIdentityBinding({ ...valid, ...extra })).toBe(false);
});

it("validates inline setup independently from narrowed attachment permissions", ({
	expect,
}) => {
	const oauth = {
		grant: "authorization_code",
		authorization_server: "https://auth.example",
		resource: "https://api.example",
		authorization_endpoint: "https://auth.example/authorize",
		token_endpoint: "https://auth.example/token",
		permission_ceiling: {
			scope: ["read", "write"],
			resources: [{ origin: "https://api.example", methods: ["GET", "POST"] }],
			inspection_resources: [
				{ url: "https://api.example/account", methods: ["GET"] },
			],
			return_urls: ["https://app.example/complete"],
		},
		client_registration: {
			mode: "existing",
			client_id: "public-client",
			authentication: "none",
		},
	};
	const input = {
		binding: "APP",
		oauth,
		scope: ["read"],
		resources: [{ url: "https://api.example/items?limit=1", methods: ["GET"] }],
	};
	expect(isIdentityBinding(input)).toBe(true);
	expect(
		isIdentityBinding({
			...input,
			...attachment,
			selection: "app",
			connector_revision: 3,
		})
	).toBe(true);
	for (const patch of [
		{ connector_id: attachment.connector_id },
		{ resources: [{ origin: "https://other.example", methods: ["GET"] }] },
		{
			inspection_resources: [
				{ origin: "https://api.example", methods: ["GET"] },
			],
		},
		{
			oauth: {
				...oauth,
				client_registration: {
					mode: "existing",
					client_id: "client",
					authentication: "client_secret_basic",
					client_secret: "not-allowed",
				},
			},
		},
		{ oauth: { ...oauth, authorization_parameters: { state: "override" } } },
	])
		expect(isIdentityBinding({ ...input, ...patch })).toBe(false);
});
