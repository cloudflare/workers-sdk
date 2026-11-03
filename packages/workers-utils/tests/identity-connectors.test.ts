import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { it, vi } from "vitest";
import { removeDir } from "../src/fs-helpers";
import {
	IdentityConnectorProvisioning,
	IdentityConnectorFileStateStore,
	withIdentityConnectorState,
	type IdentityConnectorState,
	type IdentityConnectorClient,
} from "../src/identity-connectors";
import type { ConnectionBindingConfig } from "../src/config/connections";
const id = "a7e6a4e4-6666-4666-8666-123456789abc";
const permissions = {
	scope: ["read"],
	resources: [{ origin: "https://api.example", methods: ["GET" as const] }],
};
const binding = {
	binding: "APP",
	...permissions,
	oauth: {
		grant: "authorization_code",
		authorization_server: "https://auth.example",
		resource: "https://api.example",
		authorization_endpoint: "https://auth.example/authorize",
		token_endpoint: "https://auth.example/token",
		permission_ceiling: permissions,
		client_registration: {
			mode: "existing",
			client_id: "client",
			authentication: "none",
		},
	},
} satisfies ConnectionBindingConfig;
function fixture() {
	let state: IdentityConnectorState | undefined;
	const record = { id, revision: 1, permissions };
	const store = {
		read: async () => structuredClone(state),
		write: async (next: IdentityConnectorState) => {
			state = structuredClone(next);
		},
	};
	const client: IdentityConnectorClient = {
		get: vi.fn(async () => record),
		operation: vi.fn(async () => undefined),
		create: vi.fn(async () => record),
		reconcile: vi.fn(async () => record),
	};
	const options = { accountId: "account", realm: "production", client, store };
	return {
		client,
		store,
		options,
		apply: new IdentityConnectorProvisioning(options),
		record,
	};
}
it("dry-run has no remote methods or retained-state writes", async ({
	expect,
}) => {
	const f = fixture();
	expect((await f.apply.apply(binding, "issues", true)).plan.action).toBe(
		"create"
	);
	expect(await f.store.read()).toBeUndefined();
	for (const method of Object.values(f.client)) {
		expect(method).not.toHaveBeenCalled();
	}
});
it("recovers a lost create response on another runner and retains the resource after upload failure", async ({
	expect,
}) => {
	const f = fixture();
	let accepted = false,
		operationId: string | undefined;
	vi.mocked(f.client.create).mockImplementation(async (operation) => {
		operationId = operation;
		expect((await f.store.read())?.resources["issues"]?.operationId).toBe(
			operation
		);
		accepted = true;
		throw Error("lost response");
	});
	vi.mocked(f.client.operation).mockImplementation(async (operation) =>
		accepted && operation === operationId ? f.record : undefined
	);
	await expect(f.apply.apply(binding, "issues")).rejects.toThrow(
		"lost response"
	);
	const recovered = await new IdentityConnectorProvisioning(f.options).apply(
		binding,
		"issues"
	);
	expect(recovered.binding.connector_id).toBe(id);
	expect(f.client.create).toHaveBeenCalledTimes(1);
	expect((await f.store.read())?.resources["issues"]?.operationId).toBe(
		operationId
	);
	const next = await new IdentityConnectorProvisioning(f.options).apply(
		recovered.binding,
		"renamed"
	);
	expect(next.binding.connector_id).toBe(id);
	expect(f.client.reconcile).toHaveBeenCalledWith(id, 1, binding.oauth);
});
it("never creates explicit unknown/deleted IDs and rejects foreign retained state", async ({
	expect,
}) => {
	const f = fixture();
	vi.mocked(f.client.get).mockRejectedValue(Error("connector deleted"));
	const attachment = {
		binding: "USE",
		connector_id: id,
		connector_revision: 1,
		...permissions,
	};
	await expect(f.apply.apply(attachment, "issues")).rejects.toThrow(
		"connector deleted"
	);
	expect(f.client.create).not.toHaveBeenCalled();
	await f.apply.apply(binding, "issues");
	await expect(
		new IdentityConnectorProvisioning({
			...f.options,
			accountId: "other",
		}).apply(binding, "issues")
	).rejects.toThrow("another account");
});
it("rejects changed unresolved setup and broader attachment authority", async ({
	expect,
}) => {
	const f = fixture();
	vi.mocked(f.client.create).mockRejectedValue(Error("unavailable"));
	await expect(f.apply.apply(binding, "issues")).rejects.toThrow();
	await expect(
		f.apply.apply(
			{
				...binding,
				oauth: { ...binding.oauth, resource: "https://api.example/other" },
			},
			"issues"
		)
	).rejects.toThrow("different input");
	const wide = {
		binding: "USE",
		connector_id: id,
		connector_revision: 1,
		...permissions,
		scope: ["write"],
	};
	await expect(f.apply.apply(wide, "wide")).rejects.toThrow("exceeds");
});
it("persists atomic file state and serializes competing local apply attempts", async ({
	expect,
}) => {
	const dir = await mkdtemp(path.join(tmpdir(), "identity-state-")),
		file = path.join(dir, "cloudflare.identity.json");
	try {
		await withIdentityConnectorState(file, async (store) => {
			const f = fixture();
			await new IdentityConnectorProvisioning({ ...f.options, store }).apply(
				binding,
				"issues"
			);
			await expect(
				withIdentityConnectorState(file, async () => undefined)
			).rejects.toThrow("locked");
		});
		const state = await new IdentityConnectorFileStateStore(file).read();
		expect(state?.resources["issues"]?.connectorId).toBe(id);
		expect(await readFile(file, "utf8")).not.toMatch(
			/client_secret|access_token|refresh_token/
		);
		await withIdentityConnectorState(file, async () => undefined);
	} finally {
		await removeDir(dir);
	}
});
