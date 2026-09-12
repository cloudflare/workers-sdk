import { createHash } from "node:crypto";
import { describe, it } from "vitest";
import { DefaultScopeKeys, validateScopeKeys } from "../../src/cf";
import { CF_REGISTERED_SCOPES } from "../../src/cf/scopes";
import type { Scope } from "../../src/cf";

const EXPECTED_DEFAULT_SCOPE_KEYS = [
	"openid",
	"offline",
	"user:read",
	"account:read",
	"access:read",
	"access:write",
	"agw:read",
	"agw:run",
	"agw:write",
	"ai:read",
	"ai:write",
	"ai-search:read",
	"ai-search:run",
	"ai-search:write",
	"aiaudit:read",
	"aiaudit:write",
	"aig:read",
	"aig:write",
	"auditlogs:read",
	"browser:read",
	"browser:write",
	"cfone:read",
	"cfone:write",
	"cloudchamber:write",
	"connectivity:admin",
	"connectivity:bind",
	"connectivity:read",
	"constellation:write",
	"containers:write",
	"d1:write",
	"dex:read",
	"dex:write",
	"dns_analytics:read",
	"dns_records:edit",
	"dns_records:read",
	"dns_settings:read",
	"email_routing:write",
	"email_sending:write",
	"firstpartytags:write",
	"images:read",
	"images:write",
	"lb:edit",
	"lb:read",
	"logpush:read",
	"logpush:write",
	"mcp_portals:read",
	"mcp_portals:write",
	"notebook-examples:read",
	"notification:read",
	"notification:write",
	"pages:read",
	"pages:write",
	"pipelines:read",
	"pipelines:setup",
	"pipelines:write",
	"query_cache:write",
	"queues:write",
	"r2_catalog:write",
	"radar:read",
	"rag:read",
	"rag:write",
	"registrar:read",
	"registrar:write",
	"secrets_store:read",
	"secrets_store:write",
	"sso-connector:read",
	"sso-connector:write",
	"ssl_certs:write",
	"teams:pii",
	"teams:read",
	"teams:secure_location",
	"teams:write",
	"url_scanner:read",
	"url_scanner:write",
	"vectorize:write",
	"workers:read",
	"workers:write",
	"workers_builds:read",
	"workers_builds:write",
	"workers_deployments:read",
	"workers_kv:write",
	"workers_observability:read",
	"workers_observability:write",
	"workers_observability_telemetry:write",
	"workers_routes:write",
	"workers_scripts:write",
	"workers_tail:read",
	"zone:read",
] as const;

describe("cf OAuth scopes", () => {
	it("preserves the existing default login scope set exactly", ({ expect }) => {
		expect(DefaultScopeKeys).toEqual(EXPECTED_DEFAULT_SCOPE_KEYS);
		expect(DefaultScopeKeys).toHaveLength(88);
		expect(new Set(DefaultScopeKeys).size).toBe(DefaultScopeKeys.length);
		expect(validateScopeKeys(DefaultScopeKeys)).toBe(true);
	});

	it("matches the canonical production registration", ({ expect }) => {
		expect(CF_REGISTERED_SCOPES).toHaveLength(474);
		expect(new Set(CF_REGISTERED_SCOPES).size).toBe(
			CF_REGISTERED_SCOPES.length
		);
		expect(
			createHash("sha256").update(CF_REGISTERED_SCOPES.join("\n")).digest("hex")
		).toBe("f8640f3beb785e64f5b164a0b9e1b8515f1d1ca33b9a03fc986447ae404d8d10");
		expect(validateScopeKeys([...CF_REGISTERED_SCOPES])).toBe(true);
	});

	it("accepts registered scopes without adding them to login defaults", ({
		expect,
	}) => {
		const dnsReadScope: Scope = "dns.read";

		expect(validateScopeKeys([dnsReadScope])).toBe(true);
		expect(DefaultScopeKeys).not.toContain(dnsReadScope);
		expect(
			validateScopeKeys([
				"billing:read",
				"billing:write",
				"email_routing:read",
				"email_sending:read",
				"notebook-managed:read",
				"oauth_account_ssl_and_certificates_write",
			])
		).toBe(true);
	});

	it("rejects values outside the requestable scope catalog", ({ expect }) => {
		const rejectedScopes = ["dns_read", "not-a-real-scope", "offline_access"];

		for (const scope of rejectedScopes) {
			expect(CF_REGISTERED_SCOPES).not.toContain(scope);
			expect(validateScopeKeys([scope])).toBe(false);
		}
	});
});
