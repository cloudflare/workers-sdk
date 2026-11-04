import { it } from "vitest";
import { normalizeAndValidateConfig } from "../../src/config/validation";
const receiver = {
	profile: "poppy-0.3" as const,
	accountTokens: {
		issuer: "https://auth.shop.example",
		audience: "https://api.shop.example",
	},
};
it("retains explicit receiver expectations and enables version-gated native support", ({
	expect,
}) => {
	const { config, diagnostics } = normalizeAndValidateConfig(
		{ caller_identity: receiver },
		undefined,
		undefined,
		{}
	);
	expect(diagnostics.hasErrors()).toBe(false);
	expect(config.caller_identity).toEqual(receiver);
	expect(config.compatibility_flags).toEqual([
		"enable_workload_identity_context",
		"enable_delegated_identity",
	]);
});
it("does not inherit receiver trust into a different environment", ({
	expect,
}) => {
	const { config } = normalizeAndValidateConfig(
		{ caller_identity: receiver, env: { staging: {} } },
		undefined,
		undefined,
		{ env: "staging" }
	);
	expect(config.caller_identity).toBeUndefined();
	// Compatibility capabilities may inherit; receiver trust must not.
});
it("reports malformed configuration without silently enabling it", ({
	expect,
}) => {
	const { diagnostics } = normalizeAndValidateConfig(
		{
			caller_identity: {
				profile: "poppy-0.3",
				companyId: "http://127.0.0.1",
			},
		},
		undefined,
		undefined,
		{}
	);
	expect(diagnostics.hasErrors()).toBe(true);
});

it("rejects the old receiver key instead of dropping its trust policy", ({
	expect,
}) => {
	const { diagnostics } = normalizeAndValidateConfig(
		{ identity_receiver: receiver } as never,
		undefined,
		undefined,
		{}
	);
	expect(diagnostics.hasErrors()).toBe(true);
	expect(diagnostics.renderErrors()).toContain("caller_identity");
});
