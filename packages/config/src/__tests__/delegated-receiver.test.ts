import { parseCallerIdentity } from "@cloudflare/workers-utils/oidc";
import { it } from "vitest";
import { convertToWranglerConfig } from "../convert";
import { InputWorkerSchema } from "../schema";

const receiver = {
	profile: "poppy-0.3" as const,
	accountTokens: {
		issuer: "https://auth.shop.example",
		audience: "https://api.shop.example",
	},
};
it("projects receiver trust into upload metadata and gates unsupported runtimes", ({
	expect,
}) => {
	const result = convertToWranglerConfig({
		worker: {
			name: "receiver",
			compatibilityDate: "2026-10-31",
			callerIdentity: receiver,
		},
		containers: [],
	});
	expect(result.caller_identity).toEqual(receiver);
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
			...receiver,
			profile: "latest",
		},
		{
			...receiver,
			companyId: "http://127.0.0.1",
		},
		{
			...receiver,
			accountTokens: null,
		},
	]) {
		expect(() => parseCallerIdentity(value)).toThrow();
	}
	const detached = parseCallerIdentity(receiver);
	detached.accountTokens = {
		issuer: "https://other.example",
		audience: "urn:other",
	};
	expect(receiver.accountTokens.issuer).toBe("https://auth.shop.example");
});

it("round-trips explicit camelCase overrides and rejects the old shape", ({
	expect,
}) => {
	const callerIdentity = {
		profile: "poppy-0.3" as const,
		companyId: "https://auth.shop.example",
		accountTokens: {
			...receiver.accountTokens,
			profile: "rfc9068" as const,
			jwksUri: "https://auth.shop.example/jwks",
			algorithms: ["ES256" as const],
		},
	};
	const worker = {
		name: "receiver",
		compatibilityDate: "2026-10-31",
		callerIdentity,
	};
	expect(InputWorkerSchema.parse(worker).callerIdentity).toEqual(
		callerIdentity
	);
	expect(
		convertToWranglerConfig({ worker, containers: [] }).caller_identity
	).toEqual(callerIdentity);
	expect(
		InputWorkerSchema.safeParse({ ...worker, identityReceiver: receiver })
			.success
	).toBe(false);
	for (const value of [
		{ delegated_requests: receiver },
		{ ...receiver, company_id: "https://auth.shop.example" },
		{
			...receiver,
			accountTokens: {
				...receiver.accountTokens,
				access_tokens: { jwks_uri: "https://auth.shop.example/jwks" },
			},
		},
	]) {
		expect(() => parseCallerIdentity(value)).toThrow();
	}
});
