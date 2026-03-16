import { http, HttpResponse } from "msw";
import { vi } from "vitest";
import { endEventLoop } from "./helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createFetchResult, msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

// --- Mock data ---

const mockZone = {
	id: "zone-id-1",
	name: "example.com",
	status: "active",
	account: { id: "some-account-id", name: "Test Account" },
};

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

// --- Help text tests ---

describe("email routing help", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	it("should show help text for email routing", async () => {
		await runWrangler("email routing");
		await endEventLoop();

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toContain("Manage Email Routing");
	});

	it("should show help text for email routing rules", async () => {
		await runWrangler("email routing rules");
		await endEventLoop();

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toContain("Manage Email Routing rules");
	});

	it("should show help text for email routing addresses", async () => {
		await runWrangler("email routing addresses");
		await endEventLoop();

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toContain("Manage Email Routing destination addresses");
	});
});

// --- Command tests ---

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
		it("should list zones with email routing status", async () => {
			mockListZones([mockZone]);
			mockGetSettings(mockZone.id, mockSettings);

			await runWrangler("email routing list");

			expect(std.out).toContain("example.com");
			expect(std.out).toContain("yes");
		});

		it("should handle no zones", async () => {
			mockListZones([]);

			await runWrangler("email routing list");

			expect(std.out).toContain("No zones found in this account.");
		});

		it("should show 'not configured' for zones where email routing is not set up", async () => {
			mockListZones([mockZone]);
			msw.use(
				http.get(
					"*/zones/:zoneId/email/routing",
					() => {
						return HttpResponse.json(
							createFetchResult(null, false, [
								{
									code: 1000,
									message: "not found",
								},
							])
						);
					},
					{ once: true }
				)
			);

			await runWrangler("email routing list");

			expect(std.out).toContain("example.com");
			expect(std.out).toContain("no");
			expect(std.out).toContain("not configured");
		});

		it("should show 'error' and warn for real API failures", async () => {
			mockListZones([mockZone]);
			msw.use(
				http.get(
					"*/zones/:zoneId/email/routing",
					() => {
						return HttpResponse.json(
							createFetchResult(null, false, [
								{
									code: 10000,
									message: "Authentication error",
								},
							])
						);
					},
					{ once: true }
				)
			);

			await runWrangler("email routing list");

			expect(std.out).toContain("example.com");
			expect(std.out).toContain("error");
			expect(std.warn).toContain("Failed to fetch email routing settings");
		});
	});

	// --- zone validation ---

	describe("zone validation", () => {
		it("should error when neither --zone nor --zone-id is provided", async () => {
			await expect(runWrangler("email routing settings")).rejects.toThrow(
				"You must provide either --zone (domain name) or --zone-id (zone ID)."
			);
		});

		it("should error when both --zone and --zone-id are provided", async () => {
			await expect(
				runWrangler(
					"email routing settings --zone example.com --zone-id zone-id-1"
				)
			).rejects.toThrow();
		});

		it("should error when --zone domain is not found", async () => {
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
				runWrangler("email routing settings --zone notfound.com")
			).rejects.toThrow("Could not find zone for `notfound.com`");
		});
	});

	// --- settings ---

	describe("settings", () => {
		it("should get settings with --zone-id", async () => {
			mockGetSettings("zone-id-1", mockSettings);

			await runWrangler("email routing settings --zone-id zone-id-1");

			expect(std.out).toContain("Email Routing for example.com");
			expect(std.out).toContain("Enabled:  true");
			expect(std.out).toContain("Status:   ready");
		});

		it("should get settings with --zone (domain resolution)", async () => {
			mockZoneLookup("example.com", "zone-id-1");
			mockGetSettings("zone-id-1", mockSettings);

			await runWrangler("email routing settings --zone example.com");

			expect(std.out).toContain("Email Routing for example.com");
		});
	});

	// --- enable ---

	describe("enable", () => {
		it("should enable email routing", async () => {
			mockEnableEmailRouting("zone-id-1", mockSettings);

			await runWrangler("email routing enable --zone-id zone-id-1");

			expect(std.out).toContain("Email Routing enabled for example.com");
		});
	});

	// --- disable ---

	describe("disable", () => {
		it("should disable email routing", async () => {
			mockDisableEmailRouting("zone-id-1");

			await runWrangler("email routing disable --zone-id zone-id-1");

			expect(std.out).toContain("Email Routing disabled for zone zone-id-1");
		});
	});

	// --- dns get ---

	describe("dns get", () => {
		it("should show dns records", async () => {
			mockGetDns("zone-id-1", mockDnsRecords);

			await runWrangler("email routing dns get --zone-id zone-id-1");

			expect(std.out).toContain("MX");
			expect(std.out).toContain("route1.mx.cloudflare.net");
		});
	});

	// --- dns unlock ---

	describe("dns unlock", () => {
		it("should unlock dns records", async () => {
			mockUnlockDns("zone-id-1", mockSettings);

			await runWrangler("email routing dns unlock --zone-id zone-id-1");

			expect(std.out).toContain("MX records unlocked for example.com");
		});
	});

	// --- rules list ---

	describe("rules list", () => {
		it("should list routing rules", async () => {
			mockListRules("zone-id-1", [mockRule]);

			await runWrangler("email routing rules list --zone-id zone-id-1");

			expect(std.out).toContain("rule-id-1");
			expect(std.out).toContain("My Rule");
		});

		it("should handle no rules", async () => {
			mockListRules("zone-id-1", []);

			await runWrangler("email routing rules list --zone-id zone-id-1");

			expect(std.out).toContain("No routing rules found.");
		});
	});

	// --- rules get ---

	describe("rules get", () => {
		it("should get a specific rule", async () => {
			mockGetRule("zone-id-1", "rule-id-1", mockRule);

			await runWrangler(
				"email routing rules get rule-id-1 --zone-id zone-id-1"
			);

			expect(std.out).toContain("Rule: rule-id-1");
			expect(std.out).toContain("Name:     My Rule");
			expect(std.out).toContain("Enabled:  true");
		});
	});

	// --- rules create ---

	describe("rules create", () => {
		it("should create a forwarding rule", async () => {
			const reqProm = mockCreateRule("zone-id-1");

			await runWrangler(
				"email routing rules create --zone-id zone-id-1 --match-type literal --match-field to --match-value user@example.com --action-type forward --action-value dest@example.com --name 'My Rule'"
			);

			await expect(reqProm).resolves.toMatchObject({
				matchers: [{ type: "literal", field: "to", value: "user@example.com" }],
				actions: [{ type: "forward", value: ["dest@example.com"] }],
				name: "My Rule",
			});

			expect(std.out).toContain("Created routing rule:");
		});

		it("should create a drop rule without --action-value", async () => {
			const reqProm = mockCreateRule("zone-id-1");

			await runWrangler(
				"email routing rules create --zone-id zone-id-1 --match-type literal --match-field to --match-value spam@example.com --action-type drop"
			);

			await expect(reqProm).resolves.toMatchObject({
				matchers: [{ type: "literal", field: "to", value: "spam@example.com" }],
				actions: [{ type: "drop" }],
			});

			expect(std.out).toContain("Created routing rule:");
		});

		it("should error when forward is used without --action-value", async () => {
			await expect(
				runWrangler(
					"email routing rules create --zone-id zone-id-1 --match-type literal --match-field to --match-value user@example.com --action-type forward"
				)
			).rejects.toThrow(
				"--action-value is required when --action-type is not 'drop'"
			);
		});
	});

	// --- rules update ---

	describe("rules update", () => {
		it("should update a routing rule", async () => {
			const reqProm = mockUpdateRule("zone-id-1", "rule-id-1");

			await runWrangler(
				"email routing rules update rule-id-1 --zone-id zone-id-1 --match-type literal --match-field to --match-value updated@example.com --action-type forward --action-value newdest@example.com"
			);

			await expect(reqProm).resolves.toMatchObject({
				matchers: [
					{ type: "literal", field: "to", value: "updated@example.com" },
				],
				actions: [{ type: "forward", value: ["newdest@example.com"] }],
			});

			expect(std.out).toContain("Updated routing rule:");
		});
	});

	// --- rules delete ---

	describe("rules delete", () => {
		it("should delete a routing rule", async () => {
			mockDeleteRule("zone-id-1", "rule-id-1");

			await runWrangler(
				"email routing rules delete rule-id-1 --zone-id zone-id-1"
			);

			expect(std.out).toContain("Deleted routing rule: rule-id-1");
		});
	});

	// --- catch-all get ---

	describe("rules catch-all get", () => {
		it("should get the catch-all rule", async () => {
			mockGetCatchAll("zone-id-1", mockCatchAll);

			await runWrangler(
				"email routing rules catch-all get --zone-id zone-id-1"
			);

			expect(std.out).toContain("Catch-all rule:");
			expect(std.out).toContain("Enabled: true");
			expect(std.out).toContain("forward: catchall@example.com");
		});
	});

	// --- catch-all update ---

	describe("rules catch-all update", () => {
		it("should update the catch-all rule to drop", async () => {
			const reqProm = mockUpdateCatchAll("zone-id-1");

			await runWrangler(
				"email routing rules catch-all update --zone-id zone-id-1 --action-type drop --enabled true"
			);

			await expect(reqProm).resolves.toMatchObject({
				actions: [{ type: "drop" }],
				matchers: [{ type: "all" }],
				enabled: true,
			});

			expect(std.out).toContain("Updated catch-all rule:");
		});

		it("should update the catch-all rule to forward", async () => {
			const reqProm = mockUpdateCatchAll("zone-id-1");

			await runWrangler(
				"email routing rules catch-all update --zone-id zone-id-1 --action-type forward --action-value catchall@example.com"
			);

			await expect(reqProm).resolves.toMatchObject({
				actions: [{ type: "forward", value: ["catchall@example.com"] }],
				matchers: [{ type: "all" }],
			});

			expect(std.out).toContain("Updated catch-all rule:");
		});

		it("should error when forward is used without --action-value", async () => {
			await expect(
				runWrangler(
					"email routing rules catch-all update --zone-id zone-id-1 --action-type forward"
				)
			).rejects.toThrow(
				"--action-value is required when --action-type is 'forward'"
			);
		});
	});

	// --- addresses list ---

	describe("addresses list", () => {
		it("should list destination addresses", async () => {
			mockListAddresses([mockAddress]);

			await runWrangler("email routing addresses list");

			expect(std.out).toContain("dest@example.com");
			expect(std.out).toContain("addr-id-1");
		});

		it("should handle no addresses", async () => {
			mockListAddresses([]);

			await runWrangler("email routing addresses list");

			expect(std.out).toContain("No destination addresses found.");
		});
	});

	// --- addresses get ---

	describe("addresses get", () => {
		it("should get a destination address", async () => {
			mockGetAddress("addr-id-1", mockAddress);

			await runWrangler("email routing addresses get addr-id-1");

			expect(std.out).toContain("Destination address: dest@example.com");
			expect(std.out).toContain("ID:       addr-id-1");
		});
	});

	// --- addresses create ---

	describe("addresses create", () => {
		it("should create a destination address", async () => {
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
		it("should delete a destination address", async () => {
			mockDeleteAddress("addr-id-1");

			await runWrangler("email routing addresses delete addr-id-1");

			expect(std.out).toContain("Deleted destination address: addr-id-1");
		});
	});
});

// --- Mock API handlers ---

function mockListZones(
	zones: Array<{
		id: string;
		name: string;
		status: string;
		account: { id: string; name: string };
	}>
) {
	msw.use(
		http.get(
			"*/zones",
			() => {
				return HttpResponse.json(createFetchResult(zones, true));
			},
			{ once: true }
		)
	);
}

function mockZoneLookup(domain: string, zoneId: string) {
	msw.use(
		http.get(
			"*/zones",
			({ request }) => {
				const url = new URL(request.url);
				const name = url.searchParams.get("name");
				if (name === domain) {
					return HttpResponse.json(createFetchResult([{ id: zoneId }], true));
				}
				return HttpResponse.json(createFetchResult([], true));
			},
			{ once: true }
		)
	);
}

function mockGetSettings(_zoneId: string, settings: typeof mockSettings) {
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

function mockEnableEmailRouting(
	_zoneId: string,
	settings: typeof mockSettings
) {
	msw.use(
		http.post(
			"*/zones/:zoneId/email/routing/dns",
			() => {
				return HttpResponse.json(createFetchResult(settings, true));
			},
			{ once: true }
		)
	);
}

function mockDisableEmailRouting(_zoneId: string) {
	msw.use(
		http.delete(
			"*/zones/:zoneId/email/routing/dns",
			() => {
				return HttpResponse.json(createFetchResult([], true));
			},
			{ once: true }
		)
	);
}

function mockGetDns(_zoneId: string, records: typeof mockDnsRecords) {
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

function mockUnlockDns(_zoneId: string, settings: typeof mockSettings) {
	msw.use(
		http.patch(
			"*/zones/:zoneId/email/routing/dns",
			() => {
				return HttpResponse.json(createFetchResult(settings, true));
			},
			{ once: true }
		)
	);
}

function mockListRules(_zoneId: string, rules: (typeof mockRule)[]) {
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

function mockGetRule(_zoneId: string, _ruleId: string, rule: typeof mockRule) {
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

function mockCreateRule(_zoneId: string): Promise<unknown> {
	return new Promise((resolve) => {
		msw.use(
			http.post(
				"*/zones/:zoneId/email/routing/rules",
				async ({ request }) => {
					const reqBody = await request.json();
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

function mockUpdateRule(_zoneId: string, _ruleId: string): Promise<unknown> {
	return new Promise((resolve) => {
		msw.use(
			http.put(
				"*/zones/:zoneId/email/routing/rules/:ruleId",
				async ({ request }) => {
					const reqBody = await request.json();
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

function mockDeleteRule(_zoneId: string, _ruleId: string) {
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

function mockGetCatchAll(_zoneId: string, catchAll: typeof mockCatchAll) {
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

function mockUpdateCatchAll(_zoneId: string): Promise<unknown> {
	return new Promise((resolve) => {
		msw.use(
			http.put(
				"*/zones/:zoneId/email/routing/rules/catch_all",
				async ({ request }) => {
					const reqBody = await request.json();
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

function mockGetAddress(_addressId: string, address: typeof mockAddress) {
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

function mockDeleteAddress(_addressId: string) {
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
