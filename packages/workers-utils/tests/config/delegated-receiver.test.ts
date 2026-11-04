import { it } from "vitest";
import { normalizeAndValidateConfig } from "../../src/config/validation";
const receiver = {
	delegated_requests: {
		profile: "poppy-0.3" as const,
		account_authorization: {
			issuer: "https://auth.shop.example",
			audience: "https://api.shop.example",
		},
	},
};
it("retains explicit receiver expectations and enables version-gated native support", ({
	expect,
}) => {
	const { config, diagnostics } = normalizeAndValidateConfig(
		{ identity_receiver: receiver },
		undefined,
		undefined,
		{}
	);
	expect(diagnostics.hasErrors()).toBe(false);
	expect(config.identity_receiver).toEqual(receiver);
	expect(config.compatibility_flags).toEqual([
		"enable_workload_identity_context",
		"enable_delegated_identity",
	]);
});
it("does not inherit receiver trust into a different environment", ({
	expect,
}) => {
	const { config } = normalizeAndValidateConfig(
		{ identity_receiver: receiver, env: { staging: {} } },
		undefined,
		undefined,
		{ env: "staging" }
	);
	expect(config.identity_receiver).toBeUndefined();
	// Compatibility capabilities may inherit; receiver trust must not.
});
it("reports malformed configuration without silently enabling it", ({
	expect,
}) => {
	const { diagnostics } = normalizeAndValidateConfig(
		{
			identity_receiver: {
				delegated_requests: {
					profile: "poppy-0.3",
					company_id: "http://127.0.0.1",
				},
			},
		},
		undefined,
		undefined,
		{}
	);
	expect(diagnostics.hasErrors()).toBe(true);
});
