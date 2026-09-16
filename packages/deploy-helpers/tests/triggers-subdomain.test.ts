import { beforeEach, describe, it, vi } from "vitest";
import { initDeployHelpersContext } from "../src/shared/context";
import {
	getWorkerSubdomain,
	getWorkersDevSubdomain,
} from "../src/triggers/subdomain";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

const ACCOUNT_ID = "some-account-id";

describe("getWorkersDevSubdomain", () => {
	const confirm = vi.fn();
	const getWorker = vi.fn();
	const prompt = vi.fn();

	beforeEach(() => {
		getWorker.mockReset().mockResolvedValue({
			subdomain: {
				enabled: true,
				previews_enabled: true,
				url: "https://my-worker.example.workers.dev",
				preview_url_suffix: "-my-worker.example.workers.dev",
			},
		});
		initDeployHelpersContext({
			confirm,
			createCloudflareClient: (() => ({
				workers: { beta: { workers: { get: getWorker } } },
			})) as never,
			fetchKVGetValue: (() => {}) as never,
			fetchListResult: (() => {}) as never,
			fetchPagedListResult: (() => {}) as never,
			fetchResult: (async (
				_config: ComplianceConfig,
				path: string,
				init?: RequestInit
			) => {
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
				throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${path}`);
			}) as never,
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

	it("gets the Worker subdomain through the Cloudflare SDK", async ({
		expect,
	}) => {
		const subdomain = await getWorkerSubdomain({}, ACCOUNT_ID, "my-worker");

		expect(getWorker).toHaveBeenCalledWith("my-worker", {
			account_id: ACCOUNT_ID,
		});
		expect(subdomain).toEqual({
			enabled: true,
			previews_enabled: true,
			url: "https://my-worker.example.workers.dev",
			preview_url_suffix: "-my-worker.example.workers.dev",
		});
	});
});
