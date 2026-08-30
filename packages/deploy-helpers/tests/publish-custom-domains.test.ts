import { afterEach, beforeEach, describe, it } from "vitest";
import { initDeployHelpersContext } from "../src/shared/context";
import { publishCustomDomains } from "../src/triggers/publish-routes";
import type { CustomDomainChangeset } from "../src/triggers/publish-routes";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

const ACCOUNT_ID = "some-account-id";
const SCRIPT_NAME = "test-name";
const WORKER_URL = `/accounts/${ACCOUNT_ID}/workers/scripts/${SCRIPT_NAME}`;

describe("publishCustomDomains", () => {
	const originalStdoutIsTTY = process.stdout.isTTY;
	let confirmRequests: number;
	let publishedBody: unknown;

	beforeEach(() => {
		confirmRequests = 0;
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
			confirm: async () => {
				confirmRequests++;
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
			return {
				added: [],
				removed: [],
				updated: [
					{
						id: "101",
						zone_id: "",
						zone_name: "",
						hostname: "api.example.com",
						service: SCRIPT_NAME,
						environment: "",
						enabled: true,
						previews_enabled: false,
						modified: true,
					},
				],
				conflicting: [],
			} satisfies CustomDomainChangeset;
		}

		if (path === `/accounts/${ACCOUNT_ID}/workers/domains/records/101`) {
			return {
				id: "101",
				zone_id: "",
				zone_name: "",
				hostname: "api.example.com",
				service: SCRIPT_NAME,
				environment: "",
				enabled: true,
				previews_enabled: false,
			};
		}

		if (path === `${WORKER_URL}/domains/records`) {
			publishedBody = body;
			return null;
		}

		throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${path}`);
	}

	it("updates a domain already attached to this Worker without prompting", async ({
		expect,
	}) => {
		const result = await publishCustomDomains(
			{} as ComplianceConfig,
			WORKER_URL,
			ACCOUNT_ID,
			SCRIPT_NAME,
			[
				{
					pattern: "api.example.com",
					custom_domain: true,
					previews_enabled: true,
				},
			]
		);

		expect(confirmRequests).toBe(0);
		expect(publishedBody).toEqual({
			override_scope: true,
			override_existing_origin: true,
			override_existing_dns_record: false,
			origins: [
				{
					hostname: "api.example.com",
					previews_enabled: true,
				},
			],
		});
		expect(result.targets).toEqual([
			"api.example.com (custom domain) [previews: enabled]",
		]);
	});
});
