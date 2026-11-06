// Child process for `inflight-free.spec.ts`, run with `node --expose-gc`.
//
// Reproduces cloudflare/workers-sdk#16230: an async call through a proxied
// binding can reach workerd after Miniflare has already freed a stub the call
// names. The field reproduction SIGSTOPs workerd so the finalizer's batched
// `FREE` (sent 100ms after the stub is collected) can be processed before the
// in-flight `CALL` revives its arguments. Here, the same ordering is forced
// deterministically by holding the async `CALL` back at the undici dispatch
// layer until the `FREE` has completed, so no signals are needed.
//
// Prints a final line `RESULT <json>` with what happened, then exits.

import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, "..", "..", "..");

// The spec runs with this enabled; disable it so held-back proxy responses
// can't trip the "body consumed immediately" assertion.
delete process.env.MINIFLARE_ASSERT_BODIES_CONSUMED;
// Keep the child's dev registry isolated, like `test/setup.mjs` does.
process.env.XDG_CONFIG_HOME = mkdtempSync(
	path.join(os.tmpdir(), "miniflare-inflight-")
);
delete process.env.CLOUDFLARE_DEV_REGISTRY_PATH;

const require = createRequire(path.join(pkgRoot, "package.json"));
const undici = require("undici");
const { Miniflare } = require(path.join(pkgRoot, "dist", "src", "index.js"));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function headerValue(headers, name) {
	if (headers === null || typeof headers !== "object") {
		return undefined;
	}
	if (Array.isArray(headers)) {
		for (let i = 0; i < headers.length; i += 2) {
			if (String(headers[i]).toLowerCase() === name) {
				return String(headers[i + 1]);
			}
		}
		return undefined;
	}
	if (typeof headers.get === "function") {
		return headers.get(name);
	}
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === name) {
			return String(value);
		}
	}
	return undefined;
}

// --- Hold runtime-bound `CALL`s back until the finalizer's `FREE` completes ---
// `Pool` instances dispatch via `DispatcherBase.prototype.dispatch` (two levels
// up `Pool`'s prototype chain), so patch that to reorder proxy requests.
const DispatcherBase = Object.getPrototypeOf(
	Object.getPrototypeOf(undici.Pool.prototype)
);
const originalDispatch = DispatcherBase.dispatch;
let holding = false;
const heldCalls = [];
let freedWhileInFlight = false;

// Wrap a dispatch handler so we notice when the `FREE` request completes.
function wrapHandler(handler, onDone) {
	let done = false;
	return new Proxy(handler, {
		get(target, prop) {
			const value = Reflect.get(target, prop, target);
			if (typeof value !== "function") {
				return value;
			}
			return (...args) => {
				if (!done && (prop === "onComplete" || prop === "onError")) {
					done = true;
					onDone();
				}
				return value.apply(target, args);
			};
		},
	});
}

DispatcherBase.dispatch = function (opts, handler) {
	const op = headerValue(opts?.headers, "mf-op");
	if (holding && !released && op === "CALL") {
		heldCalls.push({ pool: this, opts, handler });
		return true;
	}
	if (holding && op === "FREE") {
		const wrapped = wrapHandler(handler, () => {
			if (heldCalls.length > 0) {
				freedWhileInFlight = true;
			}
			releaseHeldCalls();
		});
		return originalDispatch.call(this, opts, wrapped);
	}
	return originalDispatch.call(this, opts, handler);
};

let released = false;
function releaseHeldCalls() {
	if (released) {
		return;
	}
	released = true;
	while (heldCalls.length > 0) {
		const { pool, opts, handler } = heldCalls.shift();
		originalDispatch.call(pool, opts, handler);
	}
}

const manifest = {
	mainModule: "index.mjs",
	modulesRoot: pkgRoot,
	modules: { "index.mjs": { type: "esm", contents: "export default {}" } },
};

function startBatch(db, registry) {
	const stmt = db.prepare("SELECT 1 AS one");
	registry.register(stmt, undefined);
	return db.batch([stmt]);
}

const mf = new Miniflare({
	workers: [
		{
			config: {
				name: "",
				compatibilityDate: "2025-05-01",
				manifest,
				env: { DB: { type: "d1", id: "db" } },
			},
		},
	],
});

try {
	const db = await mf.getD1Database("DB");

	// Prime `batch` so the next call takes the async `CALL` path (no blocking
	// synchronous round trip). Keep the primed statement alive so its own
	// finalizer cannot fire mid-test and confuse the ordering.
	const primed = db.prepare("SELECT 1 AS one");
	await db.batch([primed]);

	// Track collection of the doomed statement with our own registry.
	let collected = false;
	const registry = new FinalizationRegistry(() => {
		collected = true;
	});

	holding = true;
	// The statement stub is referenced only by the call's argument array: with
	// the bug, nothing keeps it alive once the call is serialized. (It is
	// created in a function of its own so no enclosing scope can pin it.)
	const batchPromise = startBatch(db, registry);

	// Attach the outcome handlers immediately: with the bug, the call can
	// reject while we are still waiting below, and an unhandled rejection
	// would kill this child before it can report.
	let batchSucceeded = true;
	let batchError;
	const batchOutcome = batchPromise.then(
		(results) => {
			if (!Array.isArray(results) || results.length !== 1) {
				batchSucceeded = false;
				batchError = `unexpected batch result: ${JSON.stringify(results)}`;
			}
		},
		(error) => {
			batchSucceeded = false;
			batchError = `${error}`;
		}
	);

	if (typeof globalThis.gc !== "function") {
		throw new Error("child must be run with --expose-gc");
	}
	// With the bug, the stub is collected as soon as the call is serialized;
	// with the fix, it stays pinned until the response settles, so it never is.
	const deadline = Date.now() + 10_000;
	while (!collected && Date.now() < deadline) {
		globalThis.gc();
		await sleep(50);
	}

	// If the stub was collected, Miniflare sends its `FREE` 100ms after the
	// finalizer ran; that `FREE` completing releases the held `CALL` above.
	await sleep(500);
	releaseHeldCalls();
	await batchOutcome;

	console.log(
		`RESULT ${JSON.stringify({
			collected,
			freedWhileInFlight,
			batchSucceeded,
			batchError,
		})}`
	);
} catch (error) {
	console.log(
		`RESULT ${JSON.stringify({
			childError: `${error}`,
		})}`
	);
} finally {
	holding = false;
	DispatcherBase.dispatch = originalDispatch;
	await mf.dispose();
}
