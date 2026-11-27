import fs from "node:fs";
import { setImmediate } from "node:timers/promises";
import { DeferredPromise, Miniflare } from "miniflare";
import { describe, onTestFinished, test, vi } from "vitest";
import {
	singleModuleManifest,
	TestLog,
	useDispose,
	useTmp,
} from "./test-shared";

/**
 * Builds the error Node raises when the platform refuses a new file watch,
 * such as `EMFILE` once macOS's FSEvents streams are exhausted or `ENOSPC`
 * once Linux's inotify watches are.
 */
function watchError(
	code: "EMFILE" | "ENOSPC",
	errno: number,
	message: string
): NodeJS.ErrnoException {
	return Object.assign(new Error(`${code}: ${message}, watch`), {
		errno,
		code,
		syscall: "watch",
	});
}

/**
 * Rejects with the first error the process leaves unhandled during the test.
 * An `error` event that nothing listens for surfaces this way, not as a
 * rejection of anything the test can await, so racing against this promise
 * fails the test on the error instead of on a timeout.
 */
function rejectOnUnhandledError(): Promise<never> {
	const unhandled = new DeferredPromise<never>();
	// Racing attaches a handler, but keep the rejection handled even if the
	// test returns before racing it.
	unhandled.catch(() => {});
	const onError = (error: unknown) => unhandled.reject(error);
	process.on("uncaughtException", onError);
	process.on("unhandledRejection", onError);
	onTestFinished(() => {
		process.off("uncaughtException", onError);
		process.off("unhandledRejection", onError);
	});
	return unhandled;
}

/**
 * Starts a Miniflare whose only Worker binds to a service in another dev
 * session, which makes it watch the dev registry directory.
 */
async function startBoundToExternalService(): Promise<Miniflare> {
	const mf = new Miniflare({
		log: new TestLog(),
		unsafeDevRegistryPath: await useTmp(),
		workers: [
			{
				config: {
					name: "a",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(
						`export default { fetch() { return new Response("ok"); } };`
					),
					env: { B: { type: "worker", worker: "b" } },
				},
			},
		],
	});
	useDispose(mf);
	return mf;
}

describe("dev registry watcher", { concurrent: false }, () => {
	test("keeps running when the platform refuses to watch the registry", async ({
		expect,
	}) => {
		// Linux reports an exhausted inotify watch limit by throwing from
		// `fs.watch()` itself. Refuse every watch, as the platform would.
		const refused = new DeferredPromise<void>();
		const watch = vi.spyOn(fs, "watch").mockImplementation(() => {
			refused.resolve();
			throw watchError(
				"ENOSPC",
				-28,
				"System limit for number of file watchers reached"
			);
		});
		onTestFinished(() => watch.mockRestore());
		const unhandled = rejectOnUnhandledError();

		const mf = await startBoundToExternalService();
		await Promise.race([mf.ready, unhandled]);
		await Promise.race([refused, unhandled]);
		await Promise.race([setImmediate(), unhandled]);

		const res = await Promise.race([
			mf.dispatchFetch("http://localhost"),
			unhandled,
		]);
		expect(await res.text()).toBe("ok");
	});

	test("keeps running when the registry's native watcher fails", async ({
		expect,
	}) => {
		// macOS reports an exhausted FSEvents stream table asynchronously, as an
		// `error` event on the watcher `fs.watch()` returned.
		const original = fs.watch.bind(fs) as (
			...args: Parameters<typeof fs.watch>
		) => fs.FSWatcher;
		const failed = new DeferredPromise<void>();
		const watch = vi
			.spyOn(fs, "watch")
			.mockImplementation((...args: Parameters<typeof fs.watch>) => {
				const watcher = original(...args);
				process.nextTick(() => {
					watcher.emit(
						"error",
						watchError("EMFILE", -24, "too many open files")
					);
					failed.resolve();
				});
				return watcher;
			});
		onTestFinished(() => watch.mockRestore());
		const unhandled = rejectOnUnhandledError();

		const mf = await startBoundToExternalService();
		await Promise.race([mf.ready, unhandled]);
		await Promise.race([failed, unhandled]);
		await Promise.race([setImmediate(), unhandled]);

		const res = await Promise.race([
			mf.dispatchFetch("http://localhost"),
			unhandled,
		]);
		expect(await res.text()).toBe("ok");
	});
});
