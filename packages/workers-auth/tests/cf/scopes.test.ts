import { describe, it } from "vitest";
import { DefaultScopeKeys, validateScopeKeys } from "../../src/cf";
import { CF_REGISTERED_SCOPES } from "../../src/cf/scopes";

describe("cf OAuth scopes", () => {
	it("requests the complete registered scope catalog by default", ({ expect }) => {
		expect(DefaultScopeKeys).toEqual(CF_REGISTERED_SCOPES);
		expect(new Set(DefaultScopeKeys).size).toBe(DefaultScopeKeys.length);
		expect(validateScopeKeys(DefaultScopeKeys)).toBe(true);
	});

	it("matches the canonical production registration", ({ expect }) => {
		expect(CF_REGISTERED_SCOPES).toHaveLength(474);
		expect(new Set(CF_REGISTERED_SCOPES).size).toBe(
			CF_REGISTERED_SCOPES.length
		);
		expect(validateScopeKeys([...CF_REGISTERED_SCOPES])).toBe(true);
	});

	it("rejects values outside the requestable scope catalog", ({ expect }) => {
		const rejectedScopes = ["dns_read", "not-a-real-scope", "offline_access"];

		for (const scope of rejectedScopes) {
			expect(CF_REGISTERED_SCOPES).not.toContain(scope);
			expect(validateScopeKeys([scope])).toBe(false);
		}
	});
});
