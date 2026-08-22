import { WorkerOptionsSchema } from "miniflare";
import { test } from "vitest";

function workerConfigBase(
	overrides?: Record<string, unknown>
): Record<string, unknown> {
	return {
		type: "worker",
		name: "test-worker",
		compatibilityDate: "2025-01-01",
		manifest: {
			mainModule: "index.js",
			modules: {
				"index.js": { type: "esm", contents: "export default {}" },
			},
		},
		...overrides,
	};
}

test("flagship: accepts valid flagship binding", ({ expect }) => {
	const result = WorkerOptionsSchema.safeParse({
		config: workerConfigBase({
			env: {
				FLAGS: {
					type: "flagship",
					id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
				},
			},
		}),
	});
	expect(result.success).toBe(true);
});

test("flagship: accepts flagship binding with remote", ({ expect }) => {
	const result = WorkerOptionsSchema.safeParse({
		config: workerConfigBase({
			env: {
				FLAGS: {
					type: "flagship",
					id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
					dev: { remote: true },
				},
			},
		}),
	});
	expect(result.success).toBe(true);
});

test("flagship: accepts config with no flagship binding", ({ expect }) => {
	const result = WorkerOptionsSchema.safeParse({
		config: workerConfigBase(),
	});
	expect(result.success).toBe(true);
});
