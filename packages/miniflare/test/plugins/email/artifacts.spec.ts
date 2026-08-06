import { describe, test, vi } from "vitest";
import { EmailArtifactManager } from "../../../src/plugins/email/artifacts";

const ARTIFACT = {
	recordId: "message-id@example.com",
	prefix: "email",
	id: "message-id@example.com",
	extension: "eml",
};

function deferred<T>() {
	let resolvePromise: ((value: T | PromiseLike<T>) => void) | undefined;
	const promise = new Promise<T>((resolve) => {
		resolvePromise = resolve;
	});
	return {
		promise,
		resolve(value: T) {
			if (resolvePromise === undefined) {
				throw new Error("Deferred promise was already resolved");
			}
			resolvePromise(value);
		},
	};
}

describe("EmailArtifactManager", () => {
	test("serializes writes for the same artifact", async ({ expect }) => {
		const manager = new EmailArtifactManager();
		const firstWrite = deferred<void>();
		const writes: string[] = [];

		const first = manager.store(ARTIFACT, async () => {
			writes.push("first");
			await firstWrite.promise;
			return "/first.eml";
		});
		const second = manager.store(ARTIFACT, async () => {
			writes.push("second");
			return "/second.eml";
		});

		await vi.waitFor(() => expect(writes).toEqual(["first"]));
		firstWrite.resolve(undefined);

		expect(await first).toBe("/first.eml");
		expect(await second).toBe("/second.eml");
		expect(writes).toEqual(["first", "second"]);
	});

	test("tombstones a queued write when its record is deleted", async ({
		expect,
	}) => {
		const manager = new EmailArtifactManager();
		const firstWrite = deferred<void>();
		let removed: (typeof ARTIFACT)[] = [];
		let firstStarted = false;

		const first = manager.store(ARTIFACT, async () => {
			firstStarted = true;
			await firstWrite.promise;
			return "/first.eml";
		});
		await vi.waitFor(() => expect(firstStarted).toBe(true));
		const second = manager.store(ARTIFACT, async () => "/second.eml");
		const deletion = manager.delete([ARTIFACT], async (artifacts) => {
			removed = artifacts;
		});

		firstWrite.resolve(undefined);

		expect(await first).toBe("/first.eml");
		expect(await second).toBeNull();
		await deletion;
		expect(removed).toEqual([ARTIFACT]);
	});

	test("dispose clears deletion tombstones", async ({ expect }) => {
		const manager = new EmailArtifactManager();
		const firstWrite = deferred<void>();
		let firstStarted = false;

		const first = manager.store(ARTIFACT, async () => {
			firstStarted = true;
			await firstWrite.promise;
			return "/first.eml";
		});
		await vi.waitFor(() => expect(firstStarted).toBe(true));
		const second = manager.store(ARTIFACT, async () => "/second.eml");
		const deletion = manager.delete([ARTIFACT], async () => undefined);
		manager.dispose();
		firstWrite.resolve(undefined);

		expect(await first).toBe("/first.eml");
		expect(await second).toBe("/second.eml");
		await deletion;
	});

	test("normalizes artifacts before removing them", async ({ expect }) => {
		const manager = new EmailArtifactManager();
		let removed: Array<typeof ARTIFACT> = [];

		await manager.delete(
			[
				{
					recordId: "../record",
					prefix: "../email",
					id: "../message",
					extension: "../eml",
				},
			],
			async (artifacts) => {
				removed = artifacts;
			}
		);

		expect(removed).toHaveLength(1);
		expect(removed[0]).toBeDefined();
		expect(JSON.stringify(removed[0])).not.toContain("..");
	});

	test("drain waits for pending operations", async ({ expect }) => {
		const manager = new EmailArtifactManager();
		const write = deferred<void>();
		let completed = false;

		void manager.store(ARTIFACT, async () => {
			await write.promise;
			completed = true;
			return "/message.eml";
		});

		const draining = manager.drain();
		await Promise.resolve();
		expect(completed).toBe(false);

		write.resolve(undefined);
		await draining;
		expect(completed).toBe(true);
	});
});
