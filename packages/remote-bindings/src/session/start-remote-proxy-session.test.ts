import { describe, it, vi } from "vitest";
import { startRemoteProxySession } from "./start-remote-proxy-session";
import type { MiniflareOptions } from "miniflare";

const mocks = vi.hoisted(() => ({
	createDefaultAuthHook: vi.fn(() => vi.fn()),
	createPreviewSession: vi.fn(async () => ({
		value: "session-token",
		host: "proxy.example.com",
		name: "proxy",
	})),
	createWorkerPreview: vi.fn(async () => ({
		value: "preview-token",
		host: "proxy.example.com",
	})),
	dispatchFetch: vi.fn(async () => new Response()),
	dispose: vi.fn(async () => {}),
}));

vi.mock("../auth", () => ({
	createDefaultAuthHook: mocks.createDefaultAuthHook,
}));

vi.mock("../preview/create-worker-preview", () => ({
	createPreviewSession: mocks.createPreviewSession,
	createWorkerPreview: mocks.createWorkerPreview,
}));

vi.mock("./worker-scripts", () => ({
	proxyWorkerContents: "export default {}",
	proxyServerWorkerContents: "export default {}",
}));

vi.mock("@cloudflare/workers-auth", () => ({
	getAccessHeaders: vi.fn(async () => ({ "cf-access-token": "access" })),
	getAuthFromEnv: vi.fn(),
}));

vi.mock("miniflare", async (importOriginal) => {
	const actual = await importOriginal<typeof import("miniflare")>();
	return {
		...actual,
		Miniflare: class {
			ready = Promise.resolve(new URL("http://127.0.0.1:8787"));
			constructor(_options: MiniflareOptions) {}
			dispatchFetch = mocks.dispatchFetch;
			dispose = mocks.dispose;
		},
	};
});

describe("startRemoteProxySession", () => {
	it("uploads raw bindings and starts the local proxy", async ({ expect }) => {
		const auth = {
			accountId: "account-id",
			apiToken: { apiToken: "api-token" },
		};

		const session = await startRemoteProxySession(
			{
				KV: {
					type: "kv_namespace",
					id: "namespace-id",
					remote: true,
				},
			},
			{ workerName: "proxy", auth }
		);

		expect(session.remoteProxyConnectionString.href).toBe(
			"http://127.0.0.1:8787/"
		);
		expect(mocks.createWorkerPreview).toHaveBeenCalledWith(
			{ compliance_region: undefined },
			expect.objectContaining({
				name: "proxy",
				bindings: {
					KV: expect.objectContaining({
						id: "namespace-id",
						raw: true,
					}),
				},
			}),
			auth,
			expect.anything(),
			expect.anything(),
			expect.any(AbortSignal),
			true,
			expect.anything()
		);
		expect(proxyMessages()).toEqual(["pause", "play"]);
		expect(mocks.createDefaultAuthHook).not.toHaveBeenCalled();
	});

	it("pauses, uploads, and resumes before resolving an update", async ({
		expect,
	}) => {
		const session = await startRemoteProxySession(
			{ KV: { type: "kv_namespace", id: "old", remote: true } },
			{
				auth: {
					accountId: "account-id",
					apiToken: { apiToken: "api-token" },
				},
			}
		);
		mocks.dispatchFetch.mockClear();

		await session.updateBindings({
			KV: { type: "kv_namespace", id: "new", remote: true },
		});

		expect(proxyMessages()).toEqual(["pause", "play"]);
		expect(mocks.createWorkerPreview).toHaveBeenLastCalledWith(
			expect.anything(),
			expect.objectContaining({
				bindings: {
					KV: expect.objectContaining({ id: "new", raw: true }),
				},
			}),
			expect.anything(),
			expect.anything(),
			expect.anything(),
			expect.anything(),
			true,
			expect.anything()
		);
	});

	it("disposes preview and local proxy resources", async ({ expect }) => {
		const session = await startRemoteProxySession(
			{},
			{
				auth: {
					accountId: "account-id",
					apiToken: { apiToken: "api-token" },
				},
			}
		);

		await session.dispose();

		expect(mocks.dispose).toHaveBeenCalledOnce();
	});

	it("surfaces preview upload errors", async ({ expect }) => {
		mocks.createWorkerPreview.mockRejectedValueOnce(
			new Error("The remote worker preview failed.")
		);

		await expect(
			startRemoteProxySession(
				{},
				{
					auth: {
						accountId: "account-id",
						apiToken: { apiToken: "api-token" },
					},
				}
			)
		).rejects.toThrow(
			"Failed to start the remote proxy session: The remote worker preview failed."
		);
	});

	it("resumes the previous proxy target when an update fails", async ({
		expect,
	}) => {
		const session = await startRemoteProxySession(
			{ KV: { type: "kv_namespace", id: "old", remote: true } },
			{
				auth: {
					accountId: "account-id",
					apiToken: { apiToken: "api-token" },
				},
			}
		);
		mocks.dispatchFetch.mockClear();
		mocks.createWorkerPreview.mockRejectedValueOnce(new Error("upload failed"));

		await expect(
			session.updateBindings({
				KV: { type: "kv_namespace", id: "new", remote: true },
			})
		).rejects.toThrow("upload failed");

		expect(proxyMessages()).toEqual(["pause", "play"]);
	});

	it("captures bindings for concurrent updates", async ({ expect }) => {
		const session = await startRemoteProxySession(
			{ KV: { type: "kv_namespace", id: "initial", remote: true } },
			{
				auth: {
					accountId: "account-id",
					apiToken: { apiToken: "api-token" },
				},
			}
		);
		const pendingUpload = Promise.withResolvers<{
			value: string;
			host: string;
		}>();
		mocks.createWorkerPreview.mockImplementationOnce(
			async () => pendingUpload.promise
		);

		const first = session.updateBindings({
			KV: { type: "kv_namespace", id: "first", remote: true },
		});
		await vi.waitFor(() =>
			expect(mocks.createWorkerPreview).toHaveBeenCalledTimes(2)
		);
		const second = session.updateBindings({
			KV: { type: "kv_namespace", id: "second", remote: true },
		});
		pendingUpload.resolve({ value: "first-token", host: "proxy.example.com" });
		await Promise.all([first, second]);

		const uploadedIds = mocks.createWorkerPreview.mock.calls
			.slice(-2)
			.map(([, worker]) => worker.bindings.KV?.id);
		expect(uploadedIds).toEqual(["first", "second"]);
	});

	it("rejects updates after disposal", async ({ expect }) => {
		const session = await startRemoteProxySession(
			{},
			{
				auth: {
					accountId: "account-id",
					apiToken: { apiToken: "api-token" },
				},
			}
		);
		await session.dispose();

		await expect(session.updateBindings({})).rejects.toThrow(
			"Cannot update a disposed remote proxy session"
		);
	});
});

function proxyMessages(): unknown[] {
	return mocks.dispatchFetch.mock.calls.map(
		([, init]) =>
			(init as { cf: { hostMetadata: { type: string } } }).cf.hostMetadata.type
	);
}
