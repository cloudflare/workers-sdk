import { APIError, type ComplianceConfig } from "@cloudflare/workers-utils";
import { beforeEach, describe, it, vi } from "vitest";
import { initDeployHelpersContext } from "../src/shared/context";
import {
	getWorkerSubdomain,
	getWorkersDevSubdomain,
	getWorkersDevSubdomainIfAccessible,
} from "../src/triggers/subdomain";

const ACCOUNT_ID = "some-account-id";

describe("getWorkersDevSubdomain", () => {
	const confirm = vi.fn();
	const fetchResult = vi.fn();
	const prompt = vi.fn();

	beforeEach(() => {
		fetchResult
			.mockReset()
			.mockImplementation(
				async (_config: ComplianceConfig, path: string, init?: RequestInit) => {
					if (path.endsWith("/workers/subdomain") && !init) {
						throw Object.assign(new Error("Subdomain not found"), {
							code: 10007,
						});
					}
					if (path.endsWith("/workers/subdomains/my-project")) {
						throw Object.assign(new Error("Subdomain is available"), {
							code: 10032,
						});
					}
					if (path.endsWith("/workers/subdomain") && init?.method === "PUT") {
						return { subdomain: "my-project" };
					}
					if (path.endsWith("/workers/workers/my-worker")) {
						return {
							subdomain: {
								enabled: true,
								previews_enabled: true,
								url: "https://my-worker.example.workers.dev",
								preview_url_suffix: "-my-worker.example.workers.dev",
							},
						};
					}
					throw new Error(
						`Unexpected request: ${init?.method ?? "GET"} ${path}`
					);
				}
			);
		initDeployHelpersContext({
			confirm,
			fetchKVGetValue: (() => {}) as never,
			fetchListResult: (() => {}) as never,
			fetchPagedListResult: (() => {}) as never,
			fetchResult: fetchResult as never,
			logger: {
				debug() {},
				error() {},
				info() {},
				log() {},
				warn() {},
			},
			prompt,
			select: (() => {}) as never,
		});
	});

	it("normalizes an automatic subdomain without prompting", async ({
		expect,
	}) => {
		const subdomain = await getWorkersDevSubdomain({}, ACCOUNT_ID, {
			autoRegisterSubdomain: "My Project!",
		});

		expect(subdomain).toBe("my-project.workers.dev");
		expect(confirm).not.toHaveBeenCalled();
		expect(prompt).not.toHaveBeenCalled();
	});

	it("only ignores unauthorized lookups when the subdomain is optional", async ({
		expect,
	}) => {
		const error = new APIError({
			status: 403,
			text: "Authentication error",
			telemetryMessage: false,
		});
		error.code = 10000;
		fetchResult.mockRejectedValue(error);

		await expect(getWorkersDevSubdomain({}, ACCOUNT_ID)).rejects.toBe(error);
		await expect(
			getWorkersDevSubdomainIfAccessible({}, ACCOUNT_ID)
		).resolves.toBeUndefined();
	});

	it("gets the Worker subdomain through the REST API", async ({ expect }) => {
		const subdomain = await getWorkerSubdomain({}, ACCOUNT_ID, "my-worker");

		expect(fetchResult).toHaveBeenCalledWith(
			{},
			`/accounts/${ACCOUNT_ID}/workers/workers/my-worker`
		);
		expect(subdomain).toEqual({
			enabled: true,
			previews_enabled: true,
			url: "https://my-worker.example.workers.dev",
			preview_url_suffix: "-my-worker.example.workers.dev",
		});
	});

	it("retries transient Worker subdomain lookup failures", async ({
		expect,
	}) => {
		fetchResult.mockRejectedValueOnce(
			new APIError({
				status: 503,
				text: "Service unavailable",
				telemetryMessage: false,
			})
		);

		await expect(
			getWorkerSubdomain({}, ACCOUNT_ID, "my-worker")
		).resolves.toEqual({
			enabled: true,
			previews_enabled: true,
			url: "https://my-worker.example.workers.dev",
			preview_url_suffix: "-my-worker.example.workers.dev",
		});
		expect(fetchResult).toHaveBeenCalledTimes(2);
	});
});
