import { it } from "vitest";
import { isConnectionBinding } from "../../src/config/connections";
const permissions = {
	scope: ["identity"],
	resources: [{ url: "https://api.example/session", methods: ["GET"] }],
};
const oauth = {
	grant: "authorization_code",
	authorization_server: "https://as.example",
	discovery: true,
	pushed_authorization_request_endpoint: "https://as.example/par",
	client_registration: {
		mode: "existing",
		authentication: "none",
		client_id: "https://client.example/metadata.json",
		dpop_bound_access_tokens: true,
	},
	protocol_requirements: {
		dpop_nonce: "required",
		token_response_subject: "required",
		token_response_scope: "required",
	},
	permission_ceiling: permissions,
};
it("validates pinned modern OAuth requirements without per-call proof controls", ({
	expect,
}) => {
	const binding = {
		binding: "ACCOUNT",
		selection: "customer",
		...permissions,
		oauth,
	};
	expect(isConnectionBinding(binding)).toBe(true);
	for (const protocol of [
		{ dpop_nonce: "optional" },
		{ token_response_subject: false },
		{ unknown: true },
		{ client_assertion_audience: "resource" },
	]) {
		expect(
			isConnectionBinding({
				...binding,
				oauth: { ...oauth, protocol_requirements: protocol },
			})
		).toBe(false);
	}
	expect(
		isConnectionBinding({
			...binding,
			oauth: {
				...oauth,
				client_registration: {
					...oauth.client_registration,
					dpop_bound_access_tokens: false,
				},
			},
		})
	).toBe(false);
	expect(
		isConnectionBinding({
			...binding,
			oauth: {
				...oauth,
				pushed_authorization_request_endpoint: "http://as.example/par",
			},
		})
	).toBe(false);
	expect(
		isConnectionBinding({
			...binding,
			oauth: {
				...oauth,
				client_registration: {
					...oauth.client_registration,
					key_reference: "a7e6a4e4-6666-4666-8666-123456789abc",
				},
			},
		})
	).toBe(false);
	expect(
		isConnectionBinding({
			...binding,
			oauth: {
				...oauth,
				client_registration: {
					...oauth.client_registration,
					authentication: "private_key_jwt",
					key_reference: "a7e6a4e4-6666-4666-8666-123456789abc",
				},
			},
		})
	).toBe(true);
});
