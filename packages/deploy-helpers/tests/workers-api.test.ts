import {
	APIError,
	COMPLIANCE_REGION_CONFIG_UNKNOWN,
} from "@cloudflare/workers-utils";
import {
	APIConnectionError as SDKAPIConnectionError,
	APIError as SDKAPIError,
} from "cloudflare";
import { describe, it } from "vitest";
import { fetchWorker } from "../src/deploy/helpers/workers-api";
import { initDeployHelpersContext } from "../src/shared/context";

const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";

function mockGetWorker(get: () => Promise<unknown>) {
	initDeployHelpersContext({
		createCloudflareClient: (() => ({
			workers: { beta: { workers: { get } } },
		})) as never,
		logger: {
			debug() {},
			info() {},
			warn() {},
			log() {},
			error() {},
		},
		fetchResult: (() => {}) as never,
		fetchListResult: (() => {}) as never,
		fetchPagedListResult: (() => {}) as never,
		fetchKVGetValue: (() => {}) as never,
		confirm: (() => {}) as never,
		prompt: (() => {}) as never,
		select: (() => {}) as never,
	});
}

describe("fetchWorker", () => {
	it("returns the Worker", async ({ expect }) => {
		mockGetWorker(async () => ({ id: "abc123", name: "my-worker" }));
		await expect(
			fetchWorker(COMPLIANCE_REGION_CONFIG_UNKNOWN, ACCOUNT_ID, "my-worker")
		).resolves.toMatchObject({ id: "abc123" });
	});

	it("translates Cloudflare SDK API errors into APIErrors", async ({
		expect,
	}) => {
		mockGetWorker(async () => {
			throw SDKAPIError.generate(
				404,
				{
					errors: [
						{
							code: 10007,
							message: "This Worker does not exist on your account.",
						},
					],
				},
				undefined,
				{}
			);
		});
		const error = await fetchWorker(
			COMPLIANCE_REGION_CONFIG_UNKNOWN,
			ACCOUNT_ID,
			"my-worker"
		).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(APIError);
		expect(error).toMatchObject({
			code: 10007,
			accountTag: ACCOUNT_ID,
			notes: [
				{ text: "This Worker does not exist on your account. [code: 10007]" },
			],
		});
		expect(error).toMatchInlineSnapshot(
			`[APIError: A request to the Cloudflare API (/accounts/0123456789abcdef0123456789abcdef/workers/workers/my-worker) failed.]`
		);
	});

	it("rethrows connection errors unchanged", async ({ expect }) => {
		const connectionError = new SDKAPIConnectionError({ message: "down" });
		mockGetWorker(async () => {
			throw connectionError;
		});
		await expect(
			fetchWorker(COMPLIANCE_REGION_CONFIG_UNKNOWN, ACCOUNT_ID, "my-worker")
		).rejects.toBe(connectionError);
	});
});
