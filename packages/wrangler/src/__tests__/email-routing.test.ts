import { writeFileSync } from "node:fs";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { endEventLoop } from "./helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createFetchResult, msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

// --- Mock data ---

const mockSettings = {
	id: "75610dab9e69410a82cf7e400a09ecec",
	enabled: true,
	name: "example.com",
	created: "2024-01-01T00:00:00Z",
	modified: "2024-01-02T00:00:00Z",
	skip_wizard: true,
	status: "ready",
	tag: "75610dab9e69410a82cf7e400a09ecec",
};

const mockDnsRecords = [
	{
		content: "route1.mx.cloudflare.net",
		name: "example.com",
		priority: 40,
		ttl: 1,
		type: "MX",
	},
	{
		content: "route2.mx.cloudflare.net",
		name: "example.com",
		priority: 13,
		ttl: 1,
		type: "MX",
	},
];

const mockRule = {
	id: "rule-id-1",
	actions: [{ type: "forward", value: ["dest@example.com"] }],
	enabled: true,
	matchers: [{ type: "literal", field: "to", value: "user@example.com" }],
	name: "My Rule",
	priority: 0,
	tag: "rule-tag-1",
};

const mockCatchAll = {
	id: "catch-all-id",
	actions: [{ type: "forward", value: ["catchall@example.com"] }],
	enabled: true,
	matchers: [{ type: "all" }],
	name: "catch-all",
	tag: "catch-all-tag",
};

const mockAddress = {
	id: "addr-id-1",
	created: "2024-01-01T00:00:00Z",
	email: "dest@example.com",
	modified: "2024-01-02T00:00:00Z",
	tag: "addr-tag-1",
	verified: "2024-01-01T12:00:00Z",
};

const mockSubdomain = {
	email_sending_enabled: true,
	name: "sub.example.com",
	tag: "aabbccdd11223344aabbccdd11223344",
	created: "2024-01-01T00:00:00Z",
	email_sending_dkim_selector: "cf-bounce",
	email_sending_return_path_domain: "cf-bounce.sub.example.com",
	enabled: true,
	modified: "2024-01-02T00:00:00Z",
};

const mockSendingDnsRecords = [
	{
		content: "v=spf1 include:_spf.mx.cloudflare.net ~all",
		name: "sub.example.com",
		ttl: 1,
		type: "TXT",
	},
	{
		content: "cf-bounce._domainkey.sub.example.com",
		name: "cf-bounce._domainkey.sub.example.com",
		ttl: 1,
		type: "CNAME",
	},
];

const mockSendResult = {
	delivered: ["recipient@example.com"],
	permanent_bounces: [],
	queued: [],
};

// --- Help text tests ---

describe("email routing help", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	it("should show help text for email routing", async ({ expect }) => {
		await runWrangler("email routing");
		await endEventLoop();

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toContain("Manage Email Routing");
	});

	it("should show help text for email routing rules", async ({ expect }) => {
		await runWrangler("email routing rules");
		await endEventLoop();

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toContain("Manage Email Routing rules");
	});

	it("should show help text for email routing addresses", async ({
		expect,
	}) => {
		await runWrangler("email routing addresses");
		await endEventLoop();

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toContain("Manage Email Routing destination addresses");
	});

	it("should show help text for email routing dns", async ({ expect }) => {
		await runWrangler("email routing dns");
		await endEventLoop();

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toContain("Manage Email Routing DNS settings");
	});

	it("should show help text for email sending", async ({ expect }) => {
		await runWrangler("email sending");
		await endEventLoop();

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toContain("Manage Email Sending");
	});

	it("should show help text for email sending dns", async ({ expect }) => {
		await runWrangler("email sending dns");
		await endEventLoop();

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toContain("Manage Email Sending DNS records");
	});
});

// --- Email Routing Command tests ---

describe("email routing commands", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	beforeEach(() => {
		// @ts-expect-error we're using a very simple setTimeout mock here
		vi.spyOn(global, "setTimeout").mockImplementation((fn, _period) => {
			setImmediate(fn);
		});
		setIsTTY(true);
	});

	afterEach(() => {
		clearDialogs();
	});

	// --- list ---

	describe("list", () => {
		it("should list zones with email routing status", async ({ expect }) => {
			mockListEmailRoutingZones([mockSettings]);

			await runWrangler("email routing list");

			expect(std.out).toContain("example.com");
			expect(std.out).toContain("yes");
		});

		it("should handle no zones", async ({ expect }) => {
			mockListEmailRoutingZones([]);

			await runWrangler("email routing list");

			expect(std.out).toContain(
				"No zones found with Email Routing in this account."
			);
		});

		it("should show disabled zones", async ({ expect }) => {
			mockListEmailRoutingZones([
				{ ...mockSettings, enabled: false, status: "disabled" },
			]);

			await runWrangler("email routing list");

			expect(std.out).toContain("example.com");
			expect(std.out).toContain("no");
		});
	});

	// --- zone validation ---

	describe("zone validation", () => {
		it("should error when domain is not found", async ({ expect }) => {
			// Return empty zones list for the domain lookup
			msw.use(
				http.get(
					"*/zones",
					() => {
						return HttpResponse.json(createFetchResult([], true));
					},
					{ once: true }
				)
			);

			await expect(
				runWrangler("email routing settings notfound.com")
			).rejects.toThrow("Could not find zone for `notfound.com`");
		});
	});

	// --- settings ---

	describe("settings", () => {
		it("should get settings with --zone-id", async ({ expect }) => {
			mockGetSettings(mockSettings);

			await runWrangler(
				"email routing settings example.com --zone-id zone-id-1"
			);

			expect(std.out).toContain("Email Routing for example.com");
			expect(std.out).toContain("Enabled:  true");
			expect(std.out).toContain("Status:   ready");
		});

		it("should get settings with domain resolution", async ({ expect }) => {
			mockZoneLookup("example.com", "zone-id-1");
			mockGetSettings(mockSettings);

			await runWrangler("email routing settings example.com");

			expect(std.out).toContain("Email Routing for example.com");
		});
	});

	// --- enable ---

	describe("enable", () => {
		it("should enable email routing", async ({ expect }) => {
			mockEnableEmailRouting(mockSettings);

			await runWrangler("email routing enable example.com --zone-id zone-id-1");

			expect(std.out).toContain("Email Routing enabled for example.com");
		});
	});

	// --- disable ---

	describe("disable", () => {
		it("should disable email routing", async ({ expect }) => {
			mockConfirm({
				text: "Are you sure you want to disable Email Routing for this zone?",
				result: true,
			});
			mockDisableEmailRouting({
				...mockSettings,
				enabled: false,
			});

			await runWrangler(
				"email routing disable example.com --zone-id zone-id-1"
			);

			expect(std.out).toContain("Email Routing disabled");
		});

		it("should skip confirmation with --force", async ({ expect }) => {
			mockDisableEmailRouting({
				...mockSettings,
				enabled: false,
			});

			await runWrangler(
				"email routing disable example.com --zone-id zone-id-1 --force"
			);

			expect(std.out).toContain("Email Routing disabled");
		});

		it("should abort when user declines confirmation", async ({ expect }) => {
			mockConfirm({
				text: "Are you sure you want to disable Email Routing for this zone?",
				result: false,
			});

			await runWrangler(
				"email routing disable example.com --zone-id zone-id-1"
			);

			expect(std.out).toContain("Not disabling.");
		});
	});

	// --- dns get ---

	describe("dns get", () => {
		it("should show dns records", async ({ expect }) => {
			mockGetDns(mockDnsRecords);

			await runWrangler(
				"email routing dns get example.com --zone-id zone-id-1"
			);

			expect(std.out).toContain("MX");
			expect(std.out).toContain("route1.mx.cloudflare.net");
		});

		it("should handle no dns records", async ({ expect }) => {
			mockGetDns([]);

			await runWrangler(
				"email routing dns get example.com --zone-id zone-id-1"
			);

			expect(std.out).toContain("No DNS records found.");
		});
	});

	// --- dns unlock ---

	describe("dns unlock", () => {
		it("should unlock dns records", async ({ expect }) => {
			mockConfirm({
				text: "Are you sure you want to unlock DNS records for 'example.com'? This can allow external records to override Email Routing, which may cause deliverability issues or stop emails from being delivered through Cloudflare.",
				result: true,
			});
			mockUnlockDns(mockSettings);

			await runWrangler(
				"email routing dns unlock example.com --zone-id zone-id-1"
			);

			expect(std.out).toContain("MX records unlocked for example.com");
		});

		it("should skip confirmation with --force", async ({ expect }) => {
			mockUnlockDns(mockSettings);

			await runWrangler(
				"email routing dns unlock example.com --zone-id zone-id-1 --force"
			);

			expect(std.out).toContain("MX records unlocked for example.com");
		});

		it("should abort when user declines confirmation", async ({ expect }) => {
			mockConfirm({
				text: "Are you sure you want to unlock DNS records for 'example.com'? This can allow external records to override Email Routing, which may cause deliverability issues or stop emails from being delivered through Cloudflare.",
				result: false,
			});

			await runWrangler(
				"email routing dns unlock example.com --zone-id zone-id-1"
			);

			expect(std.out).toContain("Not unlocking.");
		});
	});

	// --- rules list ---

	describe("rules list", () => {
		it("should list routing rules", async ({ expect }) => {
			mockListRules([mockRule]);

			await runWrangler(
				"email routing rules list example.com --zone-id zone-id-1"
			);

			expect(std.out).toContain("rule-id-1");
			expect(std.out).toContain("My Rule");
		});

		it("should handle no rules", async ({ expect }) => {
			mockListRules([]);

			await runWrangler(
				"email routing rules list example.com --zone-id zone-id-1"
			);

			expect(std.out).toContain("No routing rules found.");
		});

		it("should show catch-all rule separately", async ({ expect }) => {
			mockListRules([
				mockRule,
				{
					id: "catch-all-id",
					actions: [{ type: "forward", value: ["catchall@example.com"] }],
					enabled: true,
					matchers: [{ type: "all", field: "", value: "" }],
					name: "catch-all",
					tag: "catch-all-tag",
					priority: 0,
				},
			]);

			await runWrangler(
				"email routing rules list example.com --zone-id zone-id-1"
			);

			expect(std.out).toContain("rule-id-1");
			expect(std.out).toContain("Catch-all rule:");
			expect(std.out).toContain("wrangler email routing rules get catch-all");
		});
	});

	// --- rules get ---

	describe("rules get", () => {
		it("should get a specific rule", async ({ expect }) => {
			mockGetRule(mockRule);

			await runWrangler(
				"email routing rules get example.com rule-id-1 --zone-id zone-id-1"
			);

			expect(std.out).toContain("Rule: rule-id-1");
			expect(std.out).toContain("Name:     My Rule");
			expect(std.out).toContain("Enabled:  true");
		});

		it("should get the catch-all rule when rule-id is 'catch-all'", async ({
			expect,
		}) => {
			mockGetCatchAll(mockCatchAll);

			await runWrangler(
				"email routing rules get example.com catch-all --zone-id zone-id-1"
			);

			expect(std.out).toContain("Catch-all rule:");
			expect(std.out).toContain("Enabled: true");
			expect(std.out).toContain("forward: catchall@example.com");
		});

		it("should fallback to catch-all endpoint on error 2020", async ({
			expect,
		}) => {
			// Mock the regular rules endpoint to return error 2020
			msw.use(
				http.get(
					"*/zones/:zoneId/email/routing/rules/:ruleId",
					() => {
						return HttpResponse.json(
							createFetchResult(null, false, [
								{ code: 2020, message: "Invalid rule operation" },
							])
						);
					},
					{ once: true }
				)
			);
			mockGetCatchAll({ ...mockCatchAll, tag: "catch-all-tag" });

			await runWrangler(
				"email routing rules get example.com catch-all-tag --zone-id zone-id-1"
			);

			expect(std.out).toContain("Catch-all rule:");
		});
	});

	// --- rules create ---

	describe("rules create", () => {
		it("should create a forwarding rule", async ({ expect }) => {
			const reqProm = mockCreateRule();

			await runWrangler(
				"email routing rules create example.com --zone-id zone-id-1 --match-type literal --match-field to --match-value user@example.com --action-type forward --action-value dest@example.com --name 'My Rule'"
			);

			await expect(reqProm).resolves.toMatchObject({
				matchers: [{ type: "literal", field: "to", value: "user@example.com" }],
				actions: [{ type: "forward", value: ["dest@example.com"] }],
				name: "My Rule",
			});

			expect(std.out).toContain("Created routing rule:");
		});

		it("should create a drop rule without --action-value", async ({
			expect,
		}) => {
			const reqProm = mockCreateRule();

			await runWrangler(
				"email routing rules create example.com --zone-id zone-id-1 --match-type literal --match-field to --match-value spam@example.com --action-type drop"
			);

			await expect(reqProm).resolves.toMatchObject({
				matchers: [{ type: "literal", field: "to", value: "spam@example.com" }],
				actions: [{ type: "drop" }],
			});

			expect(std.out).toContain("Created routing rule:");
		});

		it("should error when forward is used without --action-value", async ({
			expect,
		}) => {
			await expect(
				runWrangler(
					"email routing rules create example.com --zone-id zone-id-1 --match-type literal --match-field to --match-value user@example.com --action-type forward"
				)
			).rejects.toThrow(
				"--action-value is required when --action-type is not 'drop'"
			);
		});
	});

	// --- rules update ---

	describe("rules update", () => {
		it("should update a routing rule", async ({ expect }) => {
			const reqProm = mockUpdateRule();

			await runWrangler(
				"email routing rules update example.com rule-id-1 --zone-id zone-id-1 --match-type literal --match-field to --match-value updated@example.com --action-type forward --action-value newdest@example.com"
			);

			await expect(reqProm).resolves.toMatchObject({
				matchers: [
					{ type: "literal", field: "to", value: "updated@example.com" },
				],
				actions: [{ type: "forward", value: ["newdest@example.com"] }],
			});

			expect(std.out).toContain("Updated routing rule:");
		});

		it("should update the catch-all rule to drop", async ({ expect }) => {
			const reqProm = mockUpdateCatchAll();

			await runWrangler(
				"email routing rules update example.com catch-all --zone-id zone-id-1 --action-type drop --enabled true"
			);

			await expect(reqProm).resolves.toMatchObject({
				actions: [{ type: "drop" }],
				matchers: [{ type: "all" }],
				enabled: true,
			});

			expect(std.out).toContain("Updated catch-all rule:");
		});

		it("should update the catch-all rule to forward", async ({ expect }) => {
			const reqProm = mockUpdateCatchAll();

			await runWrangler(
				"email routing rules update example.com catch-all --zone-id zone-id-1 --action-type forward --action-value catchall@example.com"
			);

			await expect(reqProm).resolves.toMatchObject({
				actions: [{ type: "forward", value: ["catchall@example.com"] }],
				matchers: [{ type: "all" }],
			});

			expect(std.out).toContain("Updated catch-all rule:");
		});

		it("should error when catch-all forward is used without --action-value", async ({
			expect,
		}) => {
			await expect(
				runWrangler(
					"email routing rules update example.com catch-all --zone-id zone-id-1 --action-type forward"
				)
			).rejects.toThrow(
				"--action-value is required when --action-type is 'forward'"
			);
		});

		it("should error when regular rule update is missing --match-type", async ({
			expect,
		}) => {
			await expect(
				runWrangler(
					"email routing rules update example.com rule-id-1 --zone-id zone-id-1 --action-type forward --action-value dest@example.com"
				)
			).rejects.toThrow(
				"--match-type is required when updating a regular rule"
			);
		});
	});

	// --- rules delete ---

	describe("rules delete", () => {
		it("should delete a routing rule", async ({ expect }) => {
			mockConfirm({
				text: "Are you sure you want to delete routing rule 'rule-id-1'?",
				result: true,
			});
			mockDeleteRule();

			await runWrangler(
				"email routing rules delete example.com rule-id-1 --zone-id zone-id-1"
			);

			expect(std.out).toContain("Deleted routing rule: rule-id-1");
		});

		it("should skip confirmation with --force", async ({ expect }) => {
			mockDeleteRule();

			await runWrangler(
				"email routing rules delete example.com rule-id-1 --zone-id zone-id-1 --force"
			);

			expect(std.out).toContain("Deleted routing rule: rule-id-1");
		});

		it("should abort when user declines confirmation", async ({ expect }) => {
			mockConfirm({
				text: "Are you sure you want to delete routing rule 'rule-id-1'?",
				result: false,
			});

			await runWrangler(
				"email routing rules delete example.com rule-id-1 --zone-id zone-id-1"
			);

			expect(std.out).toContain("Not deleting.");
		});
	});

	// --- addresses list ---

	describe("addresses list", () => {
		it("should list destination addresses", async ({ expect }) => {
			mockListAddresses([mockAddress]);

			await runWrangler("email routing addresses list");

			expect(std.out).toContain("dest@example.com");
			expect(std.out).toContain("addr-id-1");
		});

		it("should handle no addresses", async ({ expect }) => {
			mockListAddresses([]);

			await runWrangler("email routing addresses list");

			expect(std.out).toContain("No destination addresses found.");
		});
	});

	// --- addresses get ---

	describe("addresses get", () => {
		it("should get a destination address", async ({ expect }) => {
			mockGetAddress(mockAddress);

			await runWrangler("email routing addresses get addr-id-1");

			expect(std.out).toContain("Destination address: dest@example.com");
			expect(std.out).toContain("ID:       addr-id-1");
		});
	});

	// --- addresses create ---

	describe("addresses create", () => {
		it("should create a destination address", async ({ expect }) => {
			mockCreateAddress();

			await runWrangler("email routing addresses create newdest@example.com");

			expect(std.out).toContain(
				"Created destination address: newdest@example.com"
			);
			expect(std.out).toContain("verification email has been sent");
		});
	});

	// --- addresses delete ---

	describe("addresses delete", () => {
		it("should delete a destination address", async ({ expect }) => {
			mockConfirm({
				text: "Are you sure you want to delete destination address 'addr-id-1'?",
				result: true,
			});
			mockDeleteAddress();

			await runWrangler("email routing addresses delete addr-id-1");

			expect(std.out).toContain("Deleted destination address: addr-id-1");
		});
	});
});

// --- Email Sending Command tests ---

describe("email sending commands", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	beforeEach(() => {
		// @ts-expect-error we're using a very simple setTimeout mock here
		vi.spyOn(global, "setTimeout").mockImplementation((fn, _period) => {
			setImmediate(fn);
		});
		setIsTTY(true);
	});

	afterEach(() => {
		clearDialogs();
	});

	// --- list ---

	describe("list", () => {
		it("should list zones with email sending", async ({ expect }) => {
			mockListEmailSendingZones([mockSettings]);

			await runWrangler("email sending list");

			expect(std.out).toContain("example.com");
			expect(std.out).toContain("yes");
		});

		it("should handle no zones", async ({ expect }) => {
			mockListEmailSendingZones([]);

			await runWrangler("email sending list");

			expect(std.out).toContain(
				"No zones found with Email Sending in this account."
			);
		});
	});

	// --- settings ---

	describe("settings", () => {
		it("should get sending settings", async ({ expect }) => {
			mockZoneLookup("example.com", "zone-id-1");
			mockGetSendingSettings("zone-id-1");

			await runWrangler("email sending settings example.com");

			expect(std.out).toContain("Email Sending for example.com");
			expect(std.out).toContain("Enabled:  true");
			expect(std.out).toContain("sub.example.com");
		});
	});

	// --- enable/disable ---

	describe("enable", () => {
		it("should enable sending for a zone", async ({ expect }) => {
			mockZoneLookup("example.com", "zone-id-1");
			mockEnableSending("zone-id-1");

			await runWrangler("email sending enable example.com");

			expect(std.out).toContain("Email Sending enabled for example.com");
		});

		it("should enable sending for a subdomain", async ({ expect }) => {
			mockZoneLookup("sub.example.com", "zone-id-1");
			mockEnableSending("zone-id-1");

			await runWrangler("email sending enable sub.example.com");

			expect(std.out).toContain("Email Sending enabled for sub.example.com");
		});

		it("should not send name for zone-level domain with --zone-id", async ({
			expect,
		}) => {
			mockZoneDetails("zone-id-1", "example.com");
			const reqProm = mockEnableSendingCapture();

			await runWrangler("email sending enable example.com --zone-id zone-id-1");

			// Zone-level: body should be {} (no name)
			await expect(reqProm).resolves.toMatchObject({});
			const body = await reqProm;
			expect(body).not.toHaveProperty("name");
		});

		it("should send name for subdomain with --zone-id", async ({ expect }) => {
			mockZoneDetails("zone-id-1", "example.com");
			const reqProm = mockEnableSendingCapture();

			await runWrangler(
				"email sending enable sub.example.com --zone-id zone-id-1"
			);

			// Subdomain: body should have { name: "sub.example.com" }
			await expect(reqProm).resolves.toMatchObject({
				name: "sub.example.com",
			});
		});

		it("should correctly handle multi-label TLD with --zone-id", async ({
			expect,
		}) => {
			mockZoneDetails("zone-id-1", "example.co.uk");
			const reqProm = mockEnableSendingCapture();

			await runWrangler(
				"email sending enable example.co.uk --zone-id zone-id-1"
			);

			// example.co.uk is the zone itself, not a subdomain
			const body = await reqProm;
			expect(body).not.toHaveProperty("name");
		});

		it("should detect subdomain of multi-label TLD with --zone-id", async ({
			expect,
		}) => {
			mockZoneDetails("zone-id-1", "example.co.uk");
			const reqProm = mockEnableSendingCapture();

			await runWrangler(
				"email sending enable notifications.example.co.uk --zone-id zone-id-1"
			);

			// notifications.example.co.uk is a subdomain of example.co.uk
			await expect(reqProm).resolves.toMatchObject({
				name: "notifications.example.co.uk",
			});
		});
	});

	describe("disable", () => {
		it("should disable sending for a zone", async ({ expect }) => {
			mockConfirm({
				text: "Are you sure you want to disable Email Sending for example.com?",
				result: true,
			});
			mockZoneLookup("example.com", "zone-id-1");
			mockDisableSending("zone-id-1");

			await runWrangler("email sending disable example.com");

			expect(std.out).toContain("Email Sending disabled for example.com");
		});

		it("should not send name for zone-level domain with --zone-id", async ({
			expect,
		}) => {
			mockConfirm({
				text: "Are you sure you want to disable Email Sending for example.com?",
				result: true,
			});
			mockZoneDetails("zone-id-1", "example.com");
			const reqProm = mockDisableSendingCapture();

			await runWrangler(
				"email sending disable example.com --zone-id zone-id-1"
			);

			const body = await reqProm;
			expect(body).not.toHaveProperty("name");
		});

		it("should send name for subdomain with --zone-id", async ({ expect }) => {
			mockConfirm({
				text: "Are you sure you want to disable Email Sending for sub.example.com?",
				result: true,
			});
			mockZoneDetails("zone-id-1", "example.com");
			const reqProm = mockDisableSendingCapture();

			await runWrangler(
				"email sending disable sub.example.com --zone-id zone-id-1"
			);

			await expect(reqProm).resolves.toMatchObject({
				name: "sub.example.com",
			});
		});
	});

	// --- dns get ---

	describe("dns get", () => {
		it("should show sending dns records", async ({ expect }) => {
			mockZoneLookup("sub.example.com", "zone-id-1");
			mockGetSendingSettings("zone-id-1");
			mockGetSendingDns(
				"zone-id-1",
				"aabbccdd11223344aabbccdd11223344",
				mockSendingDnsRecords
			);

			await runWrangler("email sending dns get sub.example.com");

			expect(std.out).toContain("TXT");
			expect(std.out).toContain("v=spf1");
		});

		it("should handle no dns records", async ({ expect }) => {
			mockZoneLookup("sub.example.com", "zone-id-1");
			mockGetSendingSettings("zone-id-1");
			mockGetSendingDns("zone-id-1", "aabbccdd11223344aabbccdd11223344", []);

			await runWrangler("email sending dns get sub.example.com");

			expect(std.out).toContain(
				"No DNS records found for this sending domain."
			);
		});

		it("should use zone-level dns endpoint for zone domain with --zone-id", async ({
			expect,
		}) => {
			mockZoneDetails("zone-id-1", "example.com");
			mockGetSendingZoneDns(mockSendingDnsRecords);

			await runWrangler(
				"email sending dns get example.com --zone-id zone-id-1"
			);

			expect(std.out).toContain("TXT");
			expect(std.out).toContain("v=spf1");
		});

		it("should use subdomain dns endpoint for subdomain with --zone-id", async ({
			expect,
		}) => {
			mockZoneDetails("zone-id-1", "example.com");
			mockGetSendingSettings("zone-id-1");
			mockGetSendingDns(
				"zone-id-1",
				"aabbccdd11223344aabbccdd11223344",
				mockSendingDnsRecords
			);

			await runWrangler(
				"email sending dns get sub.example.com --zone-id zone-id-1"
			);

			expect(std.out).toContain("TXT");
			expect(std.out).toContain("v=spf1");
		});
	});

	// --- send ---

	describe("send", () => {
		it("should send an email with text body", async ({ expect }) => {
			const reqProm = mockSendEmail();

			await runWrangler(
				"email sending send --from sender@example.com --to recipient@example.com --subject 'Test Email' --text 'Hello World'"
			);

			await expect(reqProm).resolves.toMatchObject({
				from: "sender@example.com",
				to: "recipient@example.com",
				subject: "Test Email",
				text: "Hello World",
			});

			expect(std.out).toContain("Delivered to: recipient@example.com");
		});

		it("should send an email with html body", async ({ expect }) => {
			const reqProm = mockSendEmail();

			await runWrangler(
				"email sending send --from sender@example.com --to recipient@example.com --subject 'Test' --html '<h1>Hello</h1>'"
			);

			await expect(reqProm).resolves.toMatchObject({
				from: "sender@example.com",
				subject: "Test",
				html: "<h1>Hello</h1>",
			});

			expect(std.out).toContain("Delivered to:");
		});

		it("should send with from-name", async ({ expect }) => {
			const reqProm = mockSendEmail();

			await runWrangler(
				"email sending send --from sender@example.com --from-name 'John Doe' --to recipient@example.com --subject 'Test' --text 'Hi'"
			);

			await expect(reqProm).resolves.toMatchObject({
				from: { address: "sender@example.com", name: "John Doe" },
			});
		});

		it("should send with cc and bcc", async ({ expect }) => {
			const reqProm = mockSendEmail();

			await runWrangler(
				"email sending send --from sender@example.com --to recipient@example.com --cc cc@example.com --bcc bcc@example.com --subject 'Test' --text 'Hi'"
			);

			await expect(reqProm).resolves.toMatchObject({
				cc: ["cc@example.com"],
				bcc: ["bcc@example.com"],
			});
		});

		it("should send with custom headers", async ({ expect }) => {
			const reqProm = mockSendEmail();

			await runWrangler(
				"email sending send --from sender@example.com --to recipient@example.com --subject 'Test' --text 'Hi' --header 'X-Custom:value'"
			);

			await expect(reqProm).resolves.toMatchObject({
				headers: { "X-Custom": "value" },
			});
		});

		it("should error on malformed header with empty name", async ({
			expect,
		}) => {
			await expect(
				runWrangler(
					"email sending send --from sender@example.com --to recipient@example.com --subject 'Test' --text 'Hi' --header ':value'"
				)
			).rejects.toThrow("Header name cannot be empty");
		});

		it("should error on header without colon separator", async ({ expect }) => {
			await expect(
				runWrangler(
					"email sending send --from sender@example.com --to recipient@example.com --subject 'Test' --text 'Hi' --header 'NoColon'"
				)
			).rejects.toThrow("Expected 'Key:Value'");
		});

		it("should error when neither --text nor --html is provided", async ({
			expect,
		}) => {
			await expect(
				runWrangler(
					"email sending send --from sender@example.com --to recipient@example.com --subject 'Test'"
				)
			).rejects.toThrow("At least one of --text or --html must be provided");
		});

		it("should display queued and bounced recipients", async ({ expect }) => {
			mockSendEmailWithResult({
				delivered: [],
				queued: ["queued@example.com"],
				permanent_bounces: ["bounced@example.com"],
			});

			await runWrangler(
				"email sending send --from sender@example.com --to recipient@example.com --subject 'Test' --text 'Hi'"
			);

			expect(std.out).toContain("Queued for: queued@example.com");
			expect(std.warn).toContain("Permanently bounced: bounced@example.com");
		});
	});

	// --- send-raw ---

	describe("send-raw", () => {
		it("should send a raw MIME email", async ({ expect }) => {
			const reqProm = mockSendRawEmail();
			const mimeMessage =
				"From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Hello\r\n\r\nHello, World!";

			await runWrangler(
				`email sending send-raw --from sender@example.com --to recipient@example.com --mime '${mimeMessage}'`
			);

			await expect(reqProm).resolves.toMatchObject({
				from: "sender@example.com",
				recipients: ["recipient@example.com"],
				mime_message: mimeMessage,
			});

			expect(std.out).toContain("Delivered to: recipient@example.com");
		});

		it("should send a raw MIME email from file", async ({ expect }) => {
			const reqProm = mockSendRawEmail();
			const mimeContent =
				"From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: File Test\r\n\r\nBody";
			writeFileSync("test.eml", mimeContent, "utf-8");

			await runWrangler(
				"email sending send-raw --from sender@example.com --to recipient@example.com --mime-file test.eml"
			);

			await expect(reqProm).resolves.toMatchObject({
				from: "sender@example.com",
				recipients: ["recipient@example.com"],
				mime_message: mimeContent,
			});

			expect(std.out).toContain("Delivered to: recipient@example.com");
		});

		it("should error when --mime-file does not exist", async ({ expect }) => {
			await expect(
				runWrangler(
					"email sending send-raw --from sender@example.com --to recipient@example.com --mime-file nonexistent.eml"
				)
			).rejects.toThrow("Failed to read MIME file 'nonexistent.eml'");
		});

		it("should error when neither --mime nor --mime-file is provided", async ({
			expect,
		}) => {
			await expect(
				runWrangler(
					"email sending send-raw --from sender@example.com --to recipient@example.com"
				)
			).rejects.toThrow(
				"You must provide either --mime (inline MIME message) or --mime-file (path to MIME file)"
			);
		});
	});

	// --- send with attachment ---

	describe("send with attachment", () => {
		it("should send an email with a file attachment", async ({ expect }) => {
			const reqProm = mockSendEmail();
			writeFileSync("hello.txt", "Hello, World!", "utf-8");

			await runWrangler(
				"email sending send --from sender@example.com --to recipient@example.com --subject 'Test' --text 'See attached' --attachment hello.txt"
			);

			const body = await reqProm;
			expect(body).toMatchObject({
				from: "sender@example.com",
				subject: "Test",
			});
			expect(
				(body as { attachments: { filename: string }[] }).attachments[0]
					.filename
			).toBe("hello.txt");
		});

		it("should error when attachment file does not exist", async ({
			expect,
		}) => {
			await expect(
				runWrangler(
					"email sending send --from sender@example.com --to recipient@example.com --subject 'Test' --text 'Hi' --attachment nonexistent.pdf"
				)
			).rejects.toThrow("Failed to read attachment file 'nonexistent.pdf'");
		});
	});
});

// --- Mock API handlers: Email Routing ---

function mockListEmailRoutingZones(settings: (typeof mockSettings)[]) {
	msw.use(
		http.get(
			"*/accounts/:accountId/email/routing/zones",
			() => {
				return HttpResponse.json(createFetchResult(settings, true));
			},
			{ once: true }
		)
	);
}

function mockZoneDetails(zoneId: string, zoneName: string) {
	msw.use(
		http.get(
			`*/zones/${zoneId}`,
			() => {
				return HttpResponse.json(
					createFetchResult({ id: zoneId, name: zoneName }, true)
				);
			},
			{ once: true }
		)
	);
}

function mockZoneLookup(domain: string, zoneId: string) {
	// Extract the zone name (last two labels) to handle subdomain lookups
	// resolveDomain walks up labels, so "sub.example.com" tries "sub.example.com" then "example.com"
	const labels = domain.split(".");
	const zoneName = labels.slice(-2).join(".");
	msw.use(
		http.get("*/zones", ({ request }) => {
			const url = new URL(request.url);
			const name = url.searchParams.get("name");
			if (name === zoneName) {
				return HttpResponse.json(
					createFetchResult([{ id: zoneId, name: zoneName }], true)
				);
			}
			return HttpResponse.json(createFetchResult([], true));
		})
	);
}

function mockGetSettings(settings: typeof mockSettings) {
	msw.use(
		http.get(
			"*/zones/:zoneId/email/routing",
			() => {
				return HttpResponse.json(createFetchResult(settings, true));
			},
			{ once: true }
		)
	);
}

function mockEnableEmailRouting(settings: typeof mockSettings) {
	msw.use(
		http.post(
			"*/zones/:zoneId/email/routing/enable",
			() => {
				return HttpResponse.json(createFetchResult(settings, true));
			},
			{ once: true }
		)
	);
}

function mockDisableEmailRouting(settings: typeof mockSettings) {
	msw.use(
		http.post(
			"*/zones/:zoneId/email/routing/disable",
			() => {
				return HttpResponse.json(createFetchResult(settings, true));
			},
			{ once: true }
		)
	);
}

function mockGetDns(records: typeof mockDnsRecords) {
	msw.use(
		http.get(
			"*/zones/:zoneId/email/routing/dns",
			() => {
				return HttpResponse.json(createFetchResult(records, true));
			},
			{ once: true }
		)
	);
}

function mockUnlockDns(settings: typeof mockSettings) {
	msw.use(
		http.post(
			"*/zones/:zoneId/email/routing/unlock",
			() => {
				return HttpResponse.json(createFetchResult(settings, true));
			},
			{ once: true }
		)
	);
}

function mockListRules(rules: (typeof mockRule)[]) {
	msw.use(
		http.get(
			"*/zones/:zoneId/email/routing/rules",
			() => {
				return HttpResponse.json(createFetchResult(rules, true));
			},
			{ once: true }
		)
	);
}

function mockGetRule(rule: typeof mockRule) {
	msw.use(
		http.get(
			"*/zones/:zoneId/email/routing/rules/:ruleId",
			() => {
				return HttpResponse.json(createFetchResult(rule, true));
			},
			{ once: true }
		)
	);
}

function mockCreateRule(): Promise<unknown> {
	return new Promise((resolve) => {
		msw.use(
			http.post(
				"*/zones/:zoneId/email/routing/rules",
				async ({ request }) => {
					const reqBody = (await request.json()) as Record<string, unknown>;
					resolve(reqBody);
					return HttpResponse.json(
						createFetchResult({ id: "new-rule-id", ...reqBody }, true)
					);
				},
				{ once: true }
			)
		);
	});
}

function mockUpdateRule(): Promise<unknown> {
	return new Promise((resolve) => {
		msw.use(
			http.put(
				"*/zones/:zoneId/email/routing/rules/:ruleId",
				async ({ request }) => {
					const reqBody = (await request.json()) as Record<string, unknown>;
					resolve(reqBody);
					return HttpResponse.json(
						createFetchResult({ id: "rule-id-1", ...reqBody }, true)
					);
				},
				{ once: true }
			)
		);
	});
}

function mockDeleteRule() {
	msw.use(
		http.delete(
			"*/zones/:zoneId/email/routing/rules/:ruleId",
			() => {
				return HttpResponse.json(createFetchResult(mockRule, true));
			},
			{ once: true }
		)
	);
}

function mockGetCatchAll(catchAll: typeof mockCatchAll) {
	msw.use(
		http.get(
			"*/zones/:zoneId/email/routing/rules/catch_all",
			() => {
				return HttpResponse.json(createFetchResult(catchAll, true));
			},
			{ once: true }
		)
	);
}

function mockUpdateCatchAll(): Promise<unknown> {
	return new Promise((resolve) => {
		msw.use(
			http.put(
				"*/zones/:zoneId/email/routing/rules/catch_all",
				async ({ request }) => {
					const reqBody = (await request.json()) as Record<string, unknown>;
					resolve(reqBody);
					return HttpResponse.json(
						createFetchResult({ id: "catch-all-id", ...reqBody }, true)
					);
				},
				{ once: true }
			)
		);
	});
}

function mockListAddresses(addresses: (typeof mockAddress)[]) {
	msw.use(
		http.get(
			"*/accounts/:accountId/email/routing/addresses",
			() => {
				return HttpResponse.json(createFetchResult(addresses, true));
			},
			{ once: true }
		)
	);
}

function mockGetAddress(address: typeof mockAddress) {
	msw.use(
		http.get(
			"*/accounts/:accountId/email/routing/addresses/:addressId",
			() => {
				return HttpResponse.json(createFetchResult(address, true));
			},
			{ once: true }
		)
	);
}

function mockCreateAddress() {
	msw.use(
		http.post(
			"*/accounts/:accountId/email/routing/addresses",
			async ({ request }) => {
				const reqBody = (await request.json()) as { email: string };
				return HttpResponse.json(
					createFetchResult(
						{
							id: "new-addr-id",
							email: reqBody.email,
							created: "2024-01-01T00:00:00Z",
							modified: "2024-01-01T00:00:00Z",
							tag: "new-tag",
							verified: "",
						},
						true
					)
				);
			},
			{ once: true }
		)
	);
}

function mockDeleteAddress() {
	msw.use(
		http.delete(
			"*/accounts/:accountId/email/routing/addresses/:addressId",
			() => {
				return HttpResponse.json(createFetchResult(mockAddress, true));
			},
			{ once: true }
		)
	);
}

// --- Mock API handlers: Email Sending ---

function mockListEmailSendingZones(settings: (typeof mockSettings)[]) {
	msw.use(
		http.get(
			"*/accounts/:accountId/email/sending/zones",
			() => {
				return HttpResponse.json(createFetchResult(settings, true));
			},
			{ once: true }
		)
	);
}

function mockEnableSending(_zoneId: string) {
	msw.use(
		http.post(
			"*/zones/:zoneId/email/sending/enable",
			async ({ request }) => {
				const body = (await request.json()) as Record<string, unknown>;
				const name = (body.name as string) || "example.com";
				return HttpResponse.json(
					createFetchResult({ ...mockSettings, name, status: "ready" }, true)
				);
			},
			{ once: true }
		)
	);
}

function mockEnableSendingCapture(): Promise<Record<string, unknown>> {
	return new Promise((resolve) => {
		msw.use(
			http.post(
				"*/zones/:zoneId/email/sending/enable",
				async ({ request }) => {
					const body = (await request.json()) as Record<string, unknown>;
					resolve(body);
					const name = (body.name as string) || "example.com";
					return HttpResponse.json(
						createFetchResult({ ...mockSettings, name, status: "ready" }, true)
					);
				},
				{ once: true }
			)
		);
	});
}

function mockDisableSending(_zoneId: string) {
	msw.use(
		http.post(
			"*/zones/:zoneId/email/sending/disable",
			async ({ request }) => {
				const body = (await request.json()) as Record<string, unknown>;
				const name = (body.name as string) || "example.com";
				return HttpResponse.json(
					createFetchResult(
						{ ...mockSettings, name, enabled: false, status: "unconfigured" },
						true
					)
				);
			},
			{ once: true }
		)
	);
}

function mockDisableSendingCapture(): Promise<Record<string, unknown>> {
	return new Promise((resolve) => {
		msw.use(
			http.post(
				"*/zones/:zoneId/email/sending/disable",
				async ({ request }) => {
					const body = (await request.json()) as Record<string, unknown>;
					resolve(body);
					const name = (body.name as string) || "example.com";
					return HttpResponse.json(
						createFetchResult(
							{ ...mockSettings, name, enabled: false, status: "unconfigured" },
							true
						)
					);
				},
				{ once: true }
			)
		);
	});
}

function mockGetSendingZoneDns(records: typeof mockSendingDnsRecords) {
	msw.use(
		http.get(
			"*/zones/:zoneId/email/sending/dns",
			() => {
				return HttpResponse.json(createFetchResult(records, true));
			},
			{ once: true }
		)
	);
}

function mockGetSendingSettings(_zoneId: string) {
	msw.use(
		http.get(
			"*/zones/:zoneId/email/sending",
			() => {
				return HttpResponse.json(
					createFetchResult(
						{
							...mockSettings,
							subdomains: [mockSubdomain],
						},
						true
					)
				);
			},
			{ once: true }
		)
	);
}

function mockGetSendingDns(
	_zoneId: string,
	_subdomainId: string,
	records: typeof mockSendingDnsRecords
) {
	msw.use(
		http.get(
			"*/zones/:zoneId/email/sending/subdomains/:subdomainId/dns",
			() => {
				return HttpResponse.json(createFetchResult(records, true));
			},
			{ once: true }
		)
	);
}

function mockSendEmail(): Promise<unknown> {
	return new Promise((resolve) => {
		msw.use(
			http.post(
				"*/accounts/:accountId/email/sending/send",
				async ({ request }) => {
					const reqBody = await request.json();
					resolve(reqBody);
					return HttpResponse.json(createFetchResult(mockSendResult, true));
				},
				{ once: true }
			)
		);
	});
}

function mockSendEmailWithResult(result: {
	delivered: string[];
	queued: string[];
	permanent_bounces: string[];
}) {
	msw.use(
		http.post(
			"*/accounts/:accountId/email/sending/send",
			async () => {
				return HttpResponse.json(createFetchResult(result, true));
			},
			{ once: true }
		)
	);
}

function mockSendRawEmail(): Promise<unknown> {
	return new Promise((resolve) => {
		msw.use(
			http.post(
				"*/accounts/:accountId/email/sending/send_raw",
				async ({ request }) => {
					const reqBody = await request.json();
					resolve(reqBody);
					return HttpResponse.json(createFetchResult(mockSendResult, true));
				},
				{ once: true }
			)
		);
	});
}
