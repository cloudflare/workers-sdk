import { afterEach, beforeEach, describe, it } from "vitest";
import { initDeployHelpersContext } from "../src/shared/context";
import { publishCustomDomains } from "../src/triggers/publish-routes";
import type {
	CustomDomain,
	CustomDomainChangeset,
	RouteObject,
} from "../src/triggers/publish-routes";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

const ACCOUNT_ID = "some-account-id";
const SCRIPT_NAME = "test-name";
const WORKER_URL = `/accounts/${ACCOUNT_ID}/workers/scripts/${SCRIPT_NAME}`;

function createCustomDomain(
	overrides: Partial<CustomDomain> = {}
): CustomDomain {
	return {
		id: "101",
		zone_id: "",
		zone_name: "",
		hostname: "api.example.com",
		service: SCRIPT_NAME,
		environment: "",
		enabled: true,
		previews_enabled: false,
		...overrides,
	};
}

describe("publishCustomDomains", () => {
	const originalStdoutIsTTY = process.stdout.isTTY;
	let confirmRequests: number;
	let confirmMessages: string[];
	let changeset: CustomDomainChangeset;
	let changesetLookupError: boolean;
	let domainLookupError: boolean;
	let existingDomains: Record<string, CustomDomain>;
	let publishedBody: unknown;

	beforeEach(() => {
		confirmRequests = 0;
		confirmMessages = [];
		changesetLookupError = false;
		domainLookupError = false;
		const existingDomain = createCustomDomain();
		changeset = {
			added: [],
			removed: [],
			updated: [
				{
					...existingDomain,
					previews_enabled: true,
					modified: true,
				},
			],
			conflicting: [],
		};
		existingDomains = { "101": existingDomain };
		publishedBody = undefined;
		Object.defineProperty(process.stdout, "isTTY", {
			value: true,
			configurable: true,
		});

		initDeployHelpersContext({
			logger: {
				debug() {},
				error() {},
				info() {},
				log() {},
				warn() {},
			},
			fetchResult: fetchResult as never,
			fetchListResult: (() => {}) as never,
			fetchPagedListResult: (() => {}) as never,
			fetchKVGetValue: (() => {}) as never,
			confirm: async (message) => {
				confirmRequests++;
				confirmMessages.push(message);
				return true;
			},
			prompt: (() => {}) as never,
			select: (() => {}) as never,
		});
	});

	afterEach(() => {
		Object.defineProperty(process.stdout, "isTTY", {
			value: originalStdoutIsTTY,
			configurable: true,
		});
	});

	async function fetchResult(
		_config: ComplianceConfig,
		path: string,
		init?: RequestInit
	): Promise<unknown> {
		const body =
			typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

		if (path === `${WORKER_URL}/domains/changeset?replace_state=true`) {
			if (changesetLookupError) {
				throw new Error("Changeset lookup failed");
			}
			return changeset;
		}

		const domainRecordPrefix = `/accounts/${ACCOUNT_ID}/workers/domains/records/`;
		if (path.startsWith(domainRecordPrefix)) {
			if (domainLookupError) {
				throw new Error("Domain lookup failed");
			}
			const domain = existingDomains[path.slice(domainRecordPrefix.length)];
			if (domain !== undefined) {
				return domain;
			}
		}

		if (path === `${WORKER_URL}/domains/records`) {
			publishedBody = body;
			return null;
		}

		throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${path}`);
	}

	function publishDomains(
		domains: RouteObject[] = [
			{
				pattern: "api.example.com",
				custom_domain: true,
				previews_enabled: true,
			},
		]
	) {
		return publishCustomDomains(
			{} as ComplianceConfig,
			WORKER_URL,
			ACCOUNT_ID,
			SCRIPT_NAME,
			domains
		);
	}

	it.for([
		{
			name: "interactive",
			isTTY: true,
			lookupFails: false,
			changesetFails: false,
			changed: true,
		},
		{
			name: "non-interactive",
			isTTY: false,
			lookupFails: false,
			changesetFails: false,
			changed: true,
		},
		{
			name: "non-interactive with a failed state lookup",
			isTTY: false,
			lookupFails: true,
			changesetFails: false,
			changed: false,
		},
		{
			name: "non-interactive with a failed changeset lookup",
			isTTY: false,
			lookupFails: false,
			changesetFails: true,
			changed: false,
		},
	])("handles Preview enablement when $name", async (testCase, { expect }) => {
		domainLookupError = testCase.lookupFails;
		changesetLookupError = testCase.changesetFails;
		Object.defineProperty(process.stdout, "isTTY", {
			value: testCase.isTTY,
			configurable: true,
		});

		const result = await publishDomains();

		expect(result).toEqual({
			targets: ["api.example.com (custom domain) [previews: enabled]"],
			changed: testCase.changed,
		});
		expect(publishedBody).toMatchObject({
			origins: [
				{
					hostname: "api.example.com",
					previews_enabled: true,
				},
			],
		});
		expect(confirmRequests).toBe(0);
	});

	it("requires the changeset in an interactive deploy", async ({ expect }) => {
		changesetLookupError = true;

		await expect(publishDomains()).rejects.toThrow("Changeset lookup failed");
		expect(publishedBody).toBeUndefined();
	});

	it("ignores changes to a different domain without Previews", async ({
		expect,
	}) => {
		changeset.added = [
			createCustomDomain({ id: "102", hostname: "other.example.com" }),
		];
		changeset.updated = [];

		const result = await publishDomains([
			{
				pattern: "api.example.com",
				custom_domain: true,
				previews_enabled: true,
			},
			{
				pattern: "other.example.com",
				custom_domain: true,
				previews_enabled: false,
			},
		]);

		expect(result.changed).toBe(false);
	});

	it("ignores an unrelated update to a same-Worker Preview domain", async ({
		expect,
	}) => {
		const existingDomain = createCustomDomain({ previews_enabled: true });
		existingDomains["101"] = existingDomain;
		changeset.updated = [{ ...existingDomain, enabled: false, modified: true }];

		const result = await publishDomains();

		expect(result.changed).toBe(false);
	});

	it("prompts only for a foreign domain when updates have mixed ownership", async ({
		expect,
	}) => {
		const sameDomain = createCustomDomain({
			hostname: "same.example.com",
			enabled: false,
			previews_enabled: true,
		});
		const otherDomain = createCustomDomain({
			id: "102",
			hostname: "other.example.com",
			service: "other-script",
			previews_enabled: true,
		});
		changeset.updated = [
			{ ...sameDomain, enabled: true, modified: true },
			{ ...otherDomain, service: SCRIPT_NAME, modified: true },
		];
		existingDomains = { "101": sameDomain, "102": otherDomain };

		const result = await publishDomains([
			{
				pattern: "same.example.com",
				custom_domain: true,
				previews_enabled: true,
			},
			{
				pattern: "other.example.com",
				custom_domain: true,
				previews_enabled: true,
			},
		]);

		expect(result.changed).toBe(true);
		expect(confirmRequests).toBe(1);
		expect(confirmMessages[0]).toContain("other.example.com");
		expect(confirmMessages[0]).not.toContain("same.example.com");
		expect(publishedBody).toMatchObject({
			override_existing_origin: true,
			origins: [
				{
					hostname: "same.example.com",
					previews_enabled: true,
				},
				{
					hostname: "other.example.com",
					previews_enabled: true,
				},
			],
		});
	});
});
