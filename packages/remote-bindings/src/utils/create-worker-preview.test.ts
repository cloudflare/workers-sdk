import { describe, it, vi } from "vitest";

const { fetchResultBase } = vi.hoisted(() => ({
	fetchResultBase: vi.fn(),
}));

vi.mock("@cloudflare/workers-utils", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/workers-utils")>()),
	fetchResultBase,
}));

const { createPreviewSession } = await import("./create-worker-preview");

describe("createPreviewSession", () => {
	it("requests a Worker-scoped preview session rather than the account-level one", async ({
		expect,
	}) => {
		fetchResultBase.mockImplementation(async (_config, resource: string) =>
			resource.endsWith("/workers/subdomain")
				? { subdomain: "test-subdomain" }
				: { token: "test-session-token" }
		);

		await createPreviewSession(
			{} as never,
			{ accountId: "account-id", apiToken: { apiToken: "token" } },
			new AbortController().signal,
			"test-worker",
			"Wrangler"
		);

		const resources = fetchResultBase.mock.calls.map(([, resource]) => resource);
		expect(resources).toContain(
			"/accounts/account-id/workers/scripts/test-worker/subdomain/edge-preview"
		);
		expect(resources).not.toContain(
			"/accounts/account-id/workers/subdomain/edge-preview"
		);
	});
});
