import assert from "node:assert";
import { BlobStore } from "./blob.worker";
import { LogLevel, SharedBindings, SharedHeaders } from "./constants";
import { Router } from "./router.worker";
import { TypedSql, all, createTypedSql, isTypedValue } from "./sql.worker";
import { Timers } from "./timers.worker";
import { reduceError } from "./types";

export interface MiniflareDurableObjectEnv {
	// NOTE: "in-memory" storage is never in-memory. We always back simulator
	// Durable Objects with a disk directory service, so data is persisted between
	// `Miniflare#setOptions()` calls which restart the `workerd` instance. When
	// users disable persistence, we just set the persistence directory to a
	// temporary directory. This also simplifies the implementation, we can always
	// assume a `Fetcher`. This binding is optional so simulators that don't
	// persist data (e.g. Queues), don't need to provide it.
	[SharedBindings.MAYBE_SERVICE_BLOBS]?: Fetcher;
	// NOTE: this binding is optional so simulators can run standalone, without
	// a Node.js loopback server. In this case, logging is a no-op.
	[SharedBindings.MAYBE_SERVICE_LOOPBACK]?: Fetcher;
	// If set to `true`, Miniflare enables additional endpoints in Durable Objects
	// for testing. Note these endpoints allow anyone with access to the Miniflare
	// dev server to run arbitrary SQL queries and read arbitrary blobs.
	[SharedBindings.MAYBE_JSON_ENABLE_CONTROL_ENDPOINTS]?: boolean;
	// If set to `true`, Miniflare won't delete blobs when deleting/overriding
	// existing keys. This is a requirement for "stacked storage": when popping
	// from the storage stack, we need to guarantee the blobs created in and
	// before that storage stack frame still exist.
	[SharedBindings.MAYBE_JSON_ENABLE_STICKY_BLOBS]?: boolean;
}

export interface MiniflareDurableObjectCfControlOp {
	name: string;
	args?: unknown[];
}

export interface MiniflareDurableObjectCf {
	miniflare?: {
		name?: string;
		controlOp?: MiniflareDurableObjectCfControlOp;
	};
}

export abstract class MiniflareDurableObject<
	Env extends MiniflareDurableObjectEnv = MiniflareDurableObjectEnv,
> extends Router {
	readonly timers = new Timers();
	// If this Durable Object receives a control op, assume it's being tested.
	// We use this to adjust some limits in tests.
	beingTested = false;

	constructor(
		readonly state: DurableObjectState,
		readonly env: Env
	) {
		super();
	}

	#db?: TypedSql;
	get db(): TypedSql {
		return (this.#db ??= createTypedSql(this.state.storage));
	}

	#name?: string;
	get name(): string {
		// `name` should only be accessed in a `fetch` request, which will make sure
		// `#name` is initialised on first request
		assert(
			this.#name !== undefined,
			"Expected `MiniflareDurableObject#fetch()` call before `name` access"
		);
		return this.#name;
	}

	#blob?: BlobStore;
	get blob(): BlobStore {
		if (this.#blob !== undefined) return this.#blob;
		const maybeBlobsService = this.env[SharedBindings.MAYBE_SERVICE_BLOBS];
		const stickyBlobs =
			!!this.env[SharedBindings.MAYBE_JSON_ENABLE_STICKY_BLOBS];
		assert(
			maybeBlobsService !== undefined,
			`Expected ${SharedBindings.MAYBE_SERVICE_BLOBS} service binding`
		);
		this.#blob = new BlobStore(maybeBlobsService, this.name, stickyBlobs);
		return this.#blob;
	}

	async logWithLevel(level: LogLevel, message: string) {
		await this.env[SharedBindings.MAYBE_SERVICE_LOOPBACK]?.fetch(
			"http://localhost/core/log",
			{
				method: "POST",
				headers: { [SharedHeaders.LOG_LEVEL]: level.toString() },
				body: message,
			}
		);
	}

	async #handleControlOp({
		name,
		args,
	}: MiniflareDurableObjectCfControlOp): Promise<Response> {
		// Tests send control ops to update fake time, and access internal storage.
		this.beingTested = true;
		if (name === "sqlQuery") {
			// Run arbitrary SQL query (e.g. get blob ID for object)
			assert(args !== undefined);
			const [query, ...params] = args;
			assert(typeof query === "string");
			assert(params.every(isTypedValue));
			const results = all(this.db.prepare(query)(...params));
			return Response.json(results);
		} else if (name === "getBlob") {
			// Get an arbitrary blob
			assert(args !== undefined);
			const [id] = args;
			assert(typeof id === "string");
			const stream = await this.blob.get(id);
			return new Response(stream, { status: stream === null ? 404 : 200 });
		} else {
			// Enable/disable fake timers, advance time, or wait for tasks
			const func: unknown = this.timers[name as keyof Timers];
			assert(typeof func === "function");
			const result = await func.apply(this.timers, args);
			return Response.json(result ?? null);
		}
	}

	async fetch(req: Request<unknown, MiniflareDurableObjectCf>) {
		// Allow control of object internals by specifying operations in the `cf`
		// object. Used by tests to update fake time, and access internal storage.
		if (this.env[SharedBindings.MAYBE_JSON_ENABLE_CONTROL_ENDPOINTS] === true) {
			const controlOp = req?.cf?.miniflare?.controlOp;
			if (controlOp !== undefined) return this.#handleControlOp(controlOp);
		}

		// Each regular request to a `MiniflareDurableObject` includes the object
		// ID's name, so we can create the `BlobStore`. Note, we could just use the
		// object's ID to namespace the blob store, but we previously did this by
		// name, so we do this to avoid a breaking change to persistence format.
		const name = req.cf?.miniflare?.name;
		assert(name !== undefined, "Expected `cf.miniflare.name`");
		this.#name = name;

		// Dispatch the request to the underlying router
		try {
			return await super.fetch(req);
		} catch (e) {
			// `HttpError`s are handled by `Router`. If we threw another error log it.
			const error = reduceError(e);
			const fallback = error.stack ?? error.message;

			const loopbackService = this.env[SharedBindings.MAYBE_SERVICE_LOOPBACK];
			if (loopbackService !== undefined) {
				// If we have a connected loopback service, log a source mapped error
				void loopbackService
					.fetch("http://localhost/core/error", {
						method: "POST",
						body: JSON.stringify(error),
					})
					.catch(() => {
						// ...falling back to `workerd` logging (requires `--verbose` flag)
						console.error(fallback);
					});
			} else {
				// Otherwise, just use `workerd`'s logging (requires `--verbose` flag)
				console.error(fallback);
			}

			return new Response(fallback, { status: 500 });
		} finally {
			// Make sure we consume the request body if specified. Otherwise, calls
			// which make requests to this object may hang and never resolve.
			// See https://github.com/cloudflare/workerd/issues/960.
			if (req.body !== null && !req.bodyUsed) {
				await req.body.pipeTo(new WritableStream());
			}
		}
	}
}
