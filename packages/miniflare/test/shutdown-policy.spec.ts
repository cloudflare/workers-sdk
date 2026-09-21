import { containerPrivilegesAllowed } from "@cloudflare/containers-shared";
import { Miniflare, Runtime } from "miniflare";
import { afterEach, beforeEach, test, vi } from "vitest";
import { singleModuleManifest } from "./test-shared";
import type { ExpectStatic } from "vitest";

vi.mock("@cloudflare/containers-shared", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/containers-shared")>()),
	containerPrivilegesAllowed: vi.fn(),
}));

beforeEach(() => {
	vi.mocked(containerPrivilegesAllowed).mockResolvedValue(false);
});

afterEach(() => {
	vi.restoreAllMocks();
});

async function expectManagedShutdown(
	expect: ExpectStatic,
	container: object | undefined,
	expected: boolean
) {
	const updateConfig = vi.spyOn(Runtime.prototype, "updateConfig");
	const mf = new Miniflare({
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(`
						export class DurableObject {}
						export default { fetch() { return new Response("ok"); } }
					`),
					exports: {
						DurableObject: {
							type: "durable-object",
							storage: "legacy-kv",
							container,
						},
					},
				},
			},
		],
	});

	try {
		await mf.ready;
		expect(updateConfig).toHaveBeenCalledOnce();
		expect(updateConfig.mock.calls[0][1].requiresGracefulShutdown).toBe(
			expected
		);
	} finally {
		await mf.dispose();
	}
}

test("selects graceful shutdown for a Container namespace", async ({
	expect,
}) => {
	await expectManagedShutdown(expect, {}, true);
});

test("keeps immediate shutdown for an ordinary namespace", async ({
	expect,
}) => {
	await expectManagedShutdown(expect, undefined, false);
});
