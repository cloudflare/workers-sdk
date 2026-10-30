import { describe, it } from "vitest";
import { CF_CLI, DefaultScopeKeys, validateScopeKeys } from "../../src/cf";
import {
	CF_CLIENT_REGISTERED_SCOPES,
	CF_REQUESTABLE_SCOPES,
} from "../../src/cf/scopes";

const CLIENT_REGISTERED_BUT_NON_CONSENTABLE_SCOPES = [
	"billing:read",
	"billing:write",
	"email_routing:read",
	"email_sending:read",
	"notebook-managed:read",
	"oauth_account_ssl_and_certificates_write",
];

describe("cf OAuth scopes", () => {
	it("excludes explicit-only scopes from login defaults", ({ expect }) => {
		expect(DefaultScopeKeys).toEqual(
			CF_REQUESTABLE_SCOPES.filter(
				(scope) => scope !== "hyperdrive-planetscale:setup"
			)
		);
		expect(new Set(DefaultScopeKeys).size).toBe(DefaultScopeKeys.length);
		expect(validateScopeKeys(DefaultScopeKeys)).toBe(true);
	});

	it("allows PlanetScale setup when explicitly requested", ({ expect }) => {
		expect(CF_REQUESTABLE_SCOPES).toContain("hyperdrive-planetscale:setup");
		expect(DefaultScopeKeys).not.toContain("hyperdrive-planetscale:setup");
		expect(validateScopeKeys(["hyperdrive-planetscale:setup"])).toBe(true);
	});

	it("requests user token management in cf login defaults", ({ expect }) => {
		expect(CF_CLI.getDefaultScopeKeys()).toContain("user-api-tokens.write");
		expect(validateScopeKeys(["user-api-tokens.write"])).toBe(true);
	});

	it("matches the production client registration", ({ expect }) => {
		expect(CF_CLIENT_REGISTERED_SCOPES).toHaveLength(483);
		expect(new Set(CF_CLIENT_REGISTERED_SCOPES).size).toBe(
			CF_CLIENT_REGISTERED_SCOPES.length
		);
	});

	it("matches the explicitly requestable production catalog", ({ expect }) => {
		expect(CF_REQUESTABLE_SCOPES).toHaveLength(477);
		expect(new Set(CF_REQUESTABLE_SCOPES).size).toBe(
			CF_REQUESTABLE_SCOPES.length
		);
		expect(validateScopeKeys([...CF_REQUESTABLE_SCOPES])).toBe(true);
	});

	it("rejects client-registered scopes that consent cannot grant", ({
		expect,
	}) => {
		for (const scope of CLIENT_REGISTERED_BUT_NON_CONSENTABLE_SCOPES) {
			expect(CF_CLIENT_REGISTERED_SCOPES).toContain(scope);
			expect(CF_REQUESTABLE_SCOPES).not.toContain(scope);
			expect(validateScopeKeys([scope])).toBe(false);
		}
	});

	it("rejects values outside the requestable scope catalog", ({ expect }) => {
		const rejectedScopes = ["dns_read", "not-a-real-scope", "offline_access"];

		for (const scope of rejectedScopes) {
			expect(CF_CLIENT_REGISTERED_SCOPES).not.toContain(scope);
			expect(CF_REQUESTABLE_SCOPES).not.toContain(scope);
			expect(validateScopeKeys([scope])).toBe(false);
		}
	});
});
