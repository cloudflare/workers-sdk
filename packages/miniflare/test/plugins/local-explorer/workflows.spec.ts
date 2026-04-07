import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, test } from "vitest";
import { CorePaths } from "../../../src/workers/core/constants";
import { disposeWithRetry } from "../../test-shared";

const BASE_URL = `http://localhost${CorePaths.EXPLORER}/api`;

const WORKFLOW_SCRIPT = `
import { WorkflowEntrypoint } from "cloudflare:workers";
export class MyWorkflow extends WorkflowEntrypoint {
	async run(event, step) {
		await step.do("greet", async () => "hello");
		await step.sleep("wait", "1 second");
		await step.do("finalize", async () => "done");
	}
}
export default {
	async fetch(request, env) {
		return new Response("ok");
	},
};
`;

const SAMPLE_DAG = {
	version: 1,
	workflow: {
		class_name: "MyWorkflow",
		functions: {},
		nodes: [
			{
				type: "step_do",
				name: "greet",
				config: {
					retries: { limit: 5, delay: 1000, backoff: "exponential" },
					timeout: 10000,
				},
				nodes: [],
			},
			{
				type: "step_sleep",
				name: "wait",
				duration: "1 second",
			},
			{
				type: "step_do",
				name: "finalize",
				config: {
					retries: { limit: 5, delay: 1000, backoff: "exponential" },
					timeout: 10000,
				},
				nodes: [],
			},
		],
	},
};

describe("Workflows DAG API", () => {
	let mf: Miniflare;

	beforeAll(async () => {
		mf = new Miniflare({
			inspectorPort: 0,
			compatibilityDate: "2025-01-01",
			modules: true,
			script: WORKFLOW_SCRIPT,
			unsafeLocalExplorer: true,
			workflows: {
				MY_WORKFLOW: {
					name: "my-workflow",
					className: "MyWorkflow",
					dag: SAMPLE_DAG,
				},
			},
		});
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	describe("GET /workflows/:name/graph", () => {
		test("returns DAG payload when DAG is available", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/workflows/my-workflow/graph`
			);

			expect(response.status).toBe(200);
			const data = (await response.json()) as {
				success: boolean;
				result: typeof SAMPLE_DAG;
			};
			expect(data.success).toBe(true);
			expect(data.result).toEqual(SAMPLE_DAG);
		});

		test("returns 404 for non-existent workflow", async ({ expect }) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/workflows/non-existent/graph`
			);

			expect(response.status).toBe(404);
			const data = (await response.json()) as {
				success: boolean;
				errors: Array<{ message: string }>;
			};
			expect(data.success).toBe(false);
			expect(data.errors[0].message).toContain("not found");
		});
	});
});

describe("Workflows DAG API - no DAG available", () => {
	let mf: Miniflare;

	beforeAll(async () => {
		mf = new Miniflare({
			inspectorPort: 0,
			compatibilityDate: "2025-01-01",
			modules: true,
			script: WORKFLOW_SCRIPT,
			unsafeLocalExplorer: true,
			workflows: {
				MY_WORKFLOW: {
					name: "my-workflow",
					className: "MyWorkflow",
					// No dag field
				},
			},
		});
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	describe("GET /workflows/:name/graph", () => {
		test("returns 404 when DAG is not available for workflow", async ({
			expect,
		}) => {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/workflows/my-workflow/graph`
			);

			expect(response.status).toBe(404);
			const data = (await response.json()) as {
				success: boolean;
				errors: Array<{ message: string }>;
			};
			expect(data.success).toBe(false);
			expect(data.errors[0].message).toContain("DAG not available");
		});
	});
});
