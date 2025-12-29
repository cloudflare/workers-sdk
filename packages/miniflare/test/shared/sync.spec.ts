import { setTimeout } from "node:timers/promises";
import { DeferredPromise, Mutex, WaitGroup } from "miniflare";
import { expect, test } from "vitest";

test("DeferredPromise: waits for resolve/reject callbacks", async () => {
	// Check resolves with regular value
	let promise = new DeferredPromise<number>();
	promise.resolve(42);
	expect(await promise).toBe(42);

	// Check resolves with another Promise
	promise = new DeferredPromise<number>();
	promise.resolve(Promise.resolve(0));
	expect(await promise).toBe(0);

	// Check rejects with error
	promise = new DeferredPromise<number>();
	promise.reject(new Error("🤯"));
	await expect(promise).rejects.toThrow(new Error("🤯"));
});

test("Mutex: runs closures exclusively", async () => {
	const mutex = new Mutex();
	const events: number[] = [];
	await Promise.all([
		mutex.runWith(async () => {
			events.push(1);
			await setTimeout();
			events.push(2);
		}),
		mutex.runWith(async () => {
			events.push(3);
		}),
	]);
	expect(events).toEqual(events[0] === 1 ? [1, 2, 3] : [3, 1, 2]);
});
test("Mutex: lock can be acquired synchronously", () => {
	const mutex = new Mutex();
	let acquired = false;
	mutex.runWith(() => (acquired = true));
	expect(acquired).toBe(true);
});
test("Mutex: maintains separate drain queue", async () => {
	const mutex = new Mutex();
	const deferred1 = new DeferredPromise<void>();
	void mutex.runWith(() => deferred1);
	let drained = false;
	mutex.drained().then(() => (drained = true));
	await setTimeout();
	expect(drained).toBe(false);
	deferred1.resolve();
	await setTimeout();
	expect(drained).toBe(true);

	// Check drains don't count as waiters
	const deferred2 = new DeferredPromise<void>();
	const deferred3 = new DeferredPromise<void>();
	void mutex.runWith(async () => {
		await deferred2;
		expect(mutex.hasWaiting).toBe(true); // next `runWith()` is a waiter
	});
	void mutex.runWith(async () => {
		await deferred3;
		expect(mutex.hasWaiting).toBe(false); // but `drain()` isn't
	});
	drained = false;
	mutex.drained().then(() => (drained = true));
	await setTimeout();
	expect(drained).toBe(false);
	deferred2.resolve();
	await setTimeout();
	expect(drained).toBe(false);
	deferred3.resolve();
	await setTimeout();
	expect(drained).toBe(true);
});

test("WaitGroup: waits for all tasks to complete", async () => {
	const group = new WaitGroup();

	// Check doesn't wait if no tasks added
	await group.wait();

	// Check waits for single task
	let resolved = false;
	group.add(); // count -> 1
	group.wait().then(() => (resolved = true));
	await Promise.resolve();
	expect(resolved).toBe(false);

	group.done(); // count -> 0 (complete)
	await Promise.resolve();
	expect(resolved).toBe(true);

	// Check waits for multiple tasks, including those added whilst waiting
	resolved = false;
	group.add(); // count -> 1
	group.add(); // count -> 2
	group.wait().then(() => (resolved = true));
	group.add(); // count -> 3
	await Promise.resolve();
	expect(resolved).toBe(false);

	group.done(); // count -> 2
	await Promise.resolve();
	expect(resolved).toBe(false);

	group.done(); // count -> 1
	await Promise.resolve();
	expect(resolved).toBe(false);

	group.add(); // count -> 2
	await Promise.resolve();
	expect(resolved).toBe(false);

	group.done(); // count -> 1
	await Promise.resolve();
	expect(resolved).toBe(false);

	group.done(); // count -> 0 (complete)
	await Promise.resolve();
	expect(resolved).toBe(true);

	// Check allows multiple waiters
	resolved = false;
	let resolved2 = false;
	group.add(); // count -> 1
	group.wait().then(() => (resolved = true));
	group.wait().then(() => (resolved2 = true));
	await Promise.resolve();
	expect(resolved).toBe(false);
	expect(resolved2).toBe(false);

	group.done(); // count -> 0 (complete)
	await Promise.resolve();
	expect(resolved).toBe(true);
	expect(resolved2).toBe(true);
});
