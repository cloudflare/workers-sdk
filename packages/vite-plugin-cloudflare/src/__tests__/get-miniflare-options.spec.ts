import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
	vi,
} from "vitest";
import { ROUTER_WORKER_NAME } from "../constants";
import { getDevMiniflareOptions } from "../miniflare-options";
import type { WorkerOptions } from "miniflare";

describe("getDevMiniflareOptions", () => {
	beforeAll(() => {
		vi.mock("fs");
		vi.mock("path");
		vi.mock("wrangler", () => ({
			unstable_getMiniflareWorkerOptions: vi.fn(() => ({
				externalWorkers: {},
				workerOptions: {},
			})),
		}));
	});
	afterEach(() => {
		vi.resetAllMocks();
	});
	afterAll(() => {
		vi.restoreAllMocks();
	});
	test.each([
		{ run_worker_first: true },
		{ run_worker_first: false },
		{ run_worker_first: undefined },
	])(
		"Should consider run_worker_first=$run_worker_first flag",
		({ run_worker_first }) => {
			// @ts-expect-error
			const mf_options: { workers: WorkerOptions[] } = getDevMiniflareOptions(
				{
					type: "workers",
					entryWorkerEnvironmentName: "test",
					workers: {
						// @ts-expect-error
						test: {
							assets: {
								run_worker_first,
							},
						},
					},
				},
				{ config: { logLevel: "info" } },
				false
			);
			expect(mf_options).toMatchObject({ workers: expect.any(Array) });
			const worker = mf_options.workers.find(
				(worker) => worker.name === ROUTER_WORKER_NAME
			);
			expect(worker).toBeDefined();
			if (run_worker_first === undefined) {
				expect(worker).toMatchObject({
					bindings: {
						CONFIG: expect.not.objectContaining({
							invoke_user_worker_ahead_of_assets: expect.anything(),
						}),
					},
				});
			} else {
				expect(worker).toMatchObject({
					bindings: {
						CONFIG: {
							invoke_user_worker_ahead_of_assets: run_worker_first,
						},
					},
				});
			}
		}
	);
});
