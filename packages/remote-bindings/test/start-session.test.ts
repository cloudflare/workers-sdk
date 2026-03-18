import { assert, describe, expect, it, vi } from "vitest";
import { startRemoteProxySession } from "../src/index";

describe("startRemoteProxySession", () => {
	it("errors when called with no bindings", async () => {
		let thrownError: Error | undefined;

		try {
			await startRemoteProxySession(
				{},
				{
					auth: {
						accountId: "test-account-id",
						apiToken: { apiToken: "test-token" },
					},
				}
			);
		} catch (e) {
			assert(e instanceof Error);
			thrownError = e;
		}

		assert(thrownError);
		expect(thrownError.message).toContain(
			"Cannot start remote proxy session with no bindings"
		);
	});

	it("surfaces errors from the preview session API", async () => {
		let thrownError: Error | undefined;

		try {
			await startRemoteProxySession(
				{
					MY_WORKER: {
						type: "service",
						service: "my-worker",
						remote: true,
					},
				},
				{
					auth: {
						accountId: "test-account-id",
						apiToken: { apiToken: "test-token" },
					},
				}
			);
		} catch (e) {
			assert(e instanceof Error);
			thrownError = e;
		}

		assert(thrownError);
		expect(thrownError.message).toContain(
			"Failed to create remote preview session"
		);
	});

	it("preserves the preview session error as the cause", async () => {
		const cause = new Error("preview session failed");

		vi.resetModules();
		vi.doMock("../src/api/preview-session", () => ({
			createPreviewSession: vi.fn(async () => {
				throw cause;
			}),
		}));

		const { startRemoteProxySession: startRemoteProxySessionWithMock } =
			await import("../src/index");

		await expect(
			startRemoteProxySessionWithMock(
				{
					MY_WORKER: {
						type: "service",
						service: "my-worker",
						remote: true,
					},
				},
				{
					auth: {
						accountId: "test-account-id",
						apiToken: { apiToken: "test-token" },
					},
				}
			)
		).rejects.toMatchObject({
			message: "Failed to create remote preview session",
			cause,
		});

		vi.doUnmock("../src/api/preview-session");
		vi.resetModules();
	});
});
