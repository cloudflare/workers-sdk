import { setTimeout } from "node:timers/promises";
import test from "ava";
import { DeferredPromise, Mutex, WaitGroup } from "miniflare";

test("DeferredPromise: waits for resolve/reject callbacks", async (t) => {
	// Check resolves with regular value
	let promise = new DeferredPromise<number>();
	promise.resolve(42);
	t.is(await promise, 42);

	// Check resolves with another Promise
	promise = new DeferredPromise<number>();
	promise.resolve(Promise.resolve(0));
	t.is(await promise, 0);

	// Check rejects with error
	promise = new DeferredPromise<number>();
	promise.reject(new Error("🤯"));
	await t.throwsAsync(promise, { message: "🤯" });
});

test("Mutex: runs closures exclusively", async (t) => {
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
	t.deepEqual(events, events[0] === 1 ? [1, 2, 3] : [3, 1, 2]);
});
test("Mutex: lock can be acquired synchronously", (t) => {
	const mutex = new Mutex();
	let acquired = false;
	mutex.runWith(() => (acquired = true));
	t.true(acquired);
});
test("Mutex: maintains separate drain queue", async (t) => {
	const mutex = new Mutex();
	const deferred1 = new DeferredPromise<void>();
	void mutex.runWith(() => deferred1);
	let drained = false;
	mutex.drained().then(() => (drained = true));
	await setTimeout();
	t.false(drained);
	deferred1.resolve();
	await setTimeout();
	t.true(drained);

	// Check drains don't count as waiters
	const deferred2 = new DeferredPromise<void>();
	const deferred3 = new DeferredPromise<void>();
	void mutex.runWith(async () => {
		await deferred2;
		t.true(mutex.hasWaiting); // next `runWith()` is a waiter
	});
	void mutex.runWith(async () => {
		await deferred3;
		t.false(mutex.hasWaiting); // but `drain()` isn't
	});
	drained = false;
	mutex.drained().then(() => (drained = true));
	await setTimeout();
	t.false(drained);
	deferred2.resolve();
	await setTimeout();
	t.false(drained);
	deferred3.resolve();
	await setTimeout();
	t.true(drained);
});

test("WaitGroup: waits for all tasks to complete", async (t) => {
	const group = new WaitGroup();

	// Check doesn't wait if no tasks added
	await group.wait();

	// Check waits for single task
	let resolved = false;
	group.add(); // count -> 1
	group.wait().then(() => (resolved = true));
	await Promise.resolve();
	t.false(resolved);

	group.done(); // count -> 0 (complete)
	await Promise.resolve();
	t.true(resolved);

	// Check waits for multiple tasks, including those added whilst waiting
	resolved = false;
	group.add(); // count -> 1
	group.add(); // count -> 2
	group.wait().then(() => (resolved = true));
	group.add(); // count -> 3
	await Promise.resolve();
	t.false(resolved);

	group.done(); // count -> 2
	await Promise.resolve();
	t.false(resolved);

	group.done(); // count -> 1
	await Promise.resolve();
	t.false(resolved);

	group.add(); // count -> 2
	await Promise.resolve();
	t.false(resolved);

	group.done(); // count -> 1
	await Promise.resolve();
	t.false(resolved);

	group.done(); // count -> 0 (complete)
	await Promise.resolve();
	t.true(resolved);

	// Check allows multiple waiters
	resolved = false;
	let resolved2 = false;
	group.add(); // count -> 1
	group.wait().then(() => (resolved = true));
	group.wait().then(() => (resolved2 = true));
	await Promise.resolve();
	t.false(resolved);
	t.false(resolved2);

	group.done(); // count -> 0 (complete)
	await Promise.resolve();
	t.true(resolved);
	t.true(resolved2);
});
