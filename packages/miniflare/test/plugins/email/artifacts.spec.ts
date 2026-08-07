import { test } from "vitest";
import {
	drainEmailArtifactManager,
	EmailArtifactManager,
	getEmailArtifactManager,
} from "../../../src/plugins/email/artifacts";
import type { EmailArtifact } from "../../../src/workers/email/storage";

function artifact(overrides: Partial<EmailArtifact> = {}): EmailArtifact {
	return {
		recordId: "record",
		prefix: "email",
		id: "message",
		extension: "eml",
		...overrides,
	};
}

/** Yields to the microtask queue so a queued `store()` write body can run. */
async function tick(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

test("store runs the writer and returns its path", async ({ expect }) => {
	const manager = new EmailArtifactManager();

	const path = await manager.store(artifact(), async () => "/tmp/message.eml");

	expect(path).toBe("/tmp/message.eml");
});

test("store serialises concurrent writes for the same key", async ({
	expect,
}) => {
	const manager = new EmailArtifactManager();
	const order: string[] = [];
	let releaseFirst: () => void = () => {};
	const firstGate = new Promise<void>((resolve) => {
		releaseFirst = resolve;
	});

	const first = manager.store(artifact(), async () => {
		order.push("first:start");
		// Hold the first write open until we let it finish, proving the second
		// does not start until the first settles.
		await firstGate;
		order.push("first:end");
		return "/tmp/first.eml";
	});
	const second = manager.store(artifact(), async () => {
		order.push("second:start");
		return "/tmp/second.eml";
	});

	// Let queued write bodies run; only the first should have started.
	await tick();
	expect(order).toEqual(["first:start"]);
	releaseFirst();

	expect(await Promise.all([first, second])).toEqual([
		"/tmp/first.eml",
		"/tmp/second.eml",
	]);
	expect(order).toEqual(["first:start", "first:end", "second:start"]);
});

test("delete cancels a write still queued behind an in-flight write", async ({
	expect,
}) => {
	const manager = new EmailArtifactManager();
	let secondWrote = false;
	let removed = false;
	let releaseFirst: () => void = () => {};
	const firstGate = new Promise<void>((resolve) => {
		releaseFirst = resolve;
	});

	// Start the first write and let its body begin so it is genuinely in flight
	// and holding the key.
	const first = manager.store(artifact(), async () => {
		await firstGate;
		return "/tmp/first.eml";
	});
	await tick();

	// Queue a second write behind the first, then delete the key. The delete
	// tombstones the key before the second's body runs, so the second must be
	// skipped rather than resurrecting an evicted file.
	const second = manager.store(artifact(), async () => {
		secondWrote = true;
		return "/tmp/second.eml";
	});
	const remove = manager.delete([artifact()], async () => {
		removed = true;
	});

	releaseFirst();
	const [firstPath, secondPath] = await Promise.all([first, second]);
	await remove;

	expect(firstPath).toBe("/tmp/first.eml");
	// The queued second write was tombstoned by the delete before it ran.
	expect(secondWrote).toBe(false);
	expect(secondPath).toBeNull();
	expect(removed).toBe(true);
});

test("a store issued after delete completes is not suppressed", async ({
	expect,
}) => {
	const manager = new EmailArtifactManager();

	// The tombstone is a concurrency guard scoped to the delete call: once delete
	// resolves it is cleared, so a genuinely new capture of the same key later
	// writes normally.
	await manager.delete([artifact()], async () => undefined);
	let wrote = false;
	const path = await manager.store(artifact(), async () => {
		wrote = true;
		return "/tmp/message.eml";
	});

	expect(wrote).toBe(true);
	expect(path).toBe("/tmp/message.eml");
});

test("allows an artifact ID to be reused after deletion", async ({
	expect,
}) => {
	const manager = new EmailArtifactManager();
	const reused = artifact({ recordId: "record-1234", id: "record-1234" });
	let writes = 0;

	await manager.store(reused, async () => {
		writes++;
		return "/tmp/first.eml";
	});
	await manager.delete([reused], async () => {});
	await manager.store(reused, async () => {
		writes++;
		return "/tmp/second.eml";
	});

	expect(writes).toBe(2);
});

test("delete waits for an in-flight write to the same key before removing", async ({
	expect,
}) => {
	const manager = new EmailArtifactManager();
	const order: string[] = [];
	let releaseWrite: () => void = () => {};
	const writeGate = new Promise<void>((resolve) => {
		releaseWrite = resolve;
	});

	const store = manager.store(artifact(), async () => {
		order.push("write:start");
		await writeGate;
		order.push("write:end");
		return "/tmp/message.eml";
	});
	// Let the write body start before the delete queues, so delete must await it.
	await tick();

	const remove = manager.delete([artifact()], async () => {
		order.push("remove");
	});

	// The remove must observe the write finishing first, so it never deletes a
	// file that is still being written.
	releaseWrite();
	await Promise.all([store, remove]);
	expect(order).toEqual(["write:start", "write:end", "remove"]);
});

test("delete clears its tombstones even when the remover throws", async ({
	expect,
}) => {
	const manager = new EmailArtifactManager();

	await expect(
		manager.delete([artifact()], async () => {
			throw new Error("unlink failed");
		})
	).rejects.toThrow("unlink failed");

	// A failed delete must not leave the key tombstoned, otherwise the next
	// legitimate write would be silently dropped.
	let wrote = false;
	const path = await manager.store(artifact(), async () => {
		wrote = true;
		return "/tmp/message.eml";
	});
	expect(wrote).toBe(true);
	expect(path).toBe("/tmp/message.eml");
});

test("drain resolves after all pending writes settle", async ({ expect }) => {
	const manager = new EmailArtifactManager();
	let releaseWrite: () => void = () => {};
	let finished = false;
	const writeGate = new Promise<void>((resolve) => {
		releaseWrite = resolve;
	});

	void manager.store(artifact(), async () => {
		await writeGate;
		finished = true;
		return "/tmp/message.eml";
	});

	const drained = manager.drain();
	// Drain must not resolve while a write is still outstanding.
	await tick();
	expect(finished).toBe(false);
	releaseWrite();
	await drained;
	expect(finished).toBe(true);
});

test("drain swallows rejections from failed writes", async ({ expect }) => {
	const manager = new EmailArtifactManager();

	void manager
		.store(artifact(), async () => {
			throw new Error("write failed");
		})
		// The caller of `store` observes the rejection; drain must not re-throw it.
		.catch(() => undefined);

	await expect(manager.drain()).resolves.toBeUndefined();
});

test("getEmailArtifactManager returns the same instance per signal", async ({
	expect,
}) => {
	const controller = new AbortController();
	const first = getEmailArtifactManager(controller.signal);
	const second = getEmailArtifactManager(controller.signal);
	const other = getEmailArtifactManager(new AbortController().signal);

	expect(first).toBe(second);
	expect(other).not.toBe(first);

	await drainEmailArtifactManager(controller.signal);
});

test("drainEmailArtifactManager awaits pending writes and clears the cache", async ({
	expect,
}) => {
	const controller = new AbortController();
	const manager = getEmailArtifactManager(controller.signal);
	let finished = false;
	let releaseWrite: () => void = () => {};
	const writeGate = new Promise<void>((resolve) => {
		releaseWrite = resolve;
	});

	void manager.store(artifact(), async () => {
		await writeGate;
		finished = true;
		return "/tmp/message.eml";
	});

	releaseWrite();
	await drainEmailArtifactManager(controller.signal);
	expect(finished).toBe(true);

	// After draining, the cache entry is dropped, so a new lookup yields a fresh
	// manager instance.
	expect(getEmailArtifactManager(controller.signal)).not.toBe(manager);
	await drainEmailArtifactManager(controller.signal);
});
