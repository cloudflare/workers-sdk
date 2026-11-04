import { parseIdentityReceiver } from "@cloudflare/workers-utils/oidc";
import { it } from "vitest";
import { convertToWranglerConfig } from "../convert";

const receiver = {
	delegated_requests: {
		profile: "poppy-0.3" as const,
		account_authorization: {
			issuer: "https://auth.shop.example",
			audience: "https://api.shop.example",
		},
	},
};
it("projects receiver trust into upload metadata and gates unsupported runtimes", ({
	expect,
}) => {
	const result = convertToWranglerConfig({
		worker: {
			name: "receiver",
			compatibilityDate: "2026-10-31",
			identityReceiver: receiver,
		},
		containers: [],
	});
	expect(result.identity_receiver).toEqual(receiver);
	expect(result.compatibility_flags).toEqual([
		"enable_workload_identity_context",
		"enable_delegated_identity",
	]);
});
it("rejects unsupported profiles, inferred trust and private discovery URLs", ({
	expect,
}) => {
	for (const value of [
		null,
		{},
		{ ...receiver, extra: true },
		{
			delegated_requests: { ...receiver.delegated_requests, profile: "latest" },
		},
		{
			delegated_requests: {
				...receiver.delegated_requests,
				company_id: "http://127.0.0.1",
			},
		},
		{
			delegated_requests: {
				...receiver.delegated_requests,
				account_authorization: null,
			},
		},
	])
		expect(() => parseIdentityReceiver(value)).toThrow();
	const detached = parseIdentityReceiver(receiver);
	detached.delegated_requests.account_authorization = {
		issuer: "https://other.example",
		audience: "urn:other",
	};
	expect(receiver.delegated_requests.account_authorization.issuer).toBe(
		"https://auth.shop.example"
	);
});
