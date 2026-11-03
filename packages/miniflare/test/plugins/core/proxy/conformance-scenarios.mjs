// Scenarios run both inside a Worker, and in Node.js through the bindings
// returned by `Miniflare#getBindings()`, by `conformance.spec.ts`. Results are
// described in the same way in each, then compared, to check the API proxy
// matches `workerd`. This file is loaded as a Worker module, so must only use
// APIs available in both.

// 1x1 transparent PNG
const PNG = Uint8Array.from(
	atob(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
	),
	(c) => c.charCodeAt(0)
);

/** @param {Promise<unknown>} promise */
async function catchError(promise) {
	try {
		return await promise;
	} catch (e) {
		return e;
	}
}

/** @param {any} object */
function getR2ObjectData(object) {
	// `uploaded` and `version` differ between Miniflare instances
	const { uploaded, version, ...data } = object;
	return {
		...data,
		checksums: object.checksums.toJSON(),
		uploaded: uploaded instanceof Date,
		version: typeof version,
	};
}

/** @type {Record<string, (env: any, caches: any) => Promise<unknown>>} */
export const scenarios = {
	async kv(env) {
		await env.KV.put("text", "value", { metadata: { constructor: "meta" } });
		await env.KV.put("bytes", new Uint8Array([1, 2, 3]));
		return {
			text: await env.KV.get("text"),
			json: await catchError(env.KV.get("text", "json")),
			bytes: await env.KV.get("bytes", "arrayBuffer"),
			stream: await env.KV.get("bytes", "stream"),
			withMetadata: await env.KV.getWithMetadata("text"),
			list: await env.KV.list(),
			missing: await env.KV.get("missing"),
			invalid: await catchError(env.KV.get("")),
		};
	},

	async r2(env) {
		const put = await env.R2.put("key", "value", {
			httpMetadata: { contentType: "text/plain", cacheExpiry: new Date(0) },
			customMetadata: { constructor: "custom" },
		});
		const head = await env.R2.head("key");
		const headers = new Headers();
		head.writeHttpMetadata(headers);
		const body = await env.R2.get("key");
		const bodyUsed = body.bodyUsed;
		const ranged = await env.R2.get("key", { range: { offset: 1, length: 2 } });
		const list = await env.R2.list();
		return {
			put: getR2ObjectData(put),
			head: getR2ObjectData(head),
			headers,
			body: { bodyUsed, text: await body.text(), bodyUsedAfter: body.bodyUsed },
			ranged: { range: ranged.range, text: await ranged.text() },
			blob: await (await env.R2.get("key")).blob(),
			json: await catchError((await env.R2.get("key")).json()),
			list: list.objects.map(
				(/** @type {{ key: string }} */ object) => object.key
			),
			missing: await env.R2.get("missing"),
			invalid: await catchError(env.R2.put("x".repeat(1025), "")),
		};
	},

	async r2MultipartUpload(env) {
		const upload = await env.R2.createMultipartUpload("multipart");
		const part = await upload.uploadPart(1, "part");
		const resumed = env.R2.resumeMultipartUpload("multipart", upload.uploadId);
		const object = await resumed.complete([part]);
		return {
			key: upload.key,
			resumedKey: resumed.key,
			resumedUploadId: resumed.uploadId === upload.uploadId,
			partNumber: part.partNumber,
			object: { key: object.key, size: object.size },
			invalid: await catchError(resumed.complete([part])),
		};
	},

	async d1(env) {
		await env.DB.exec(
			"CREATE TABLE entries (id INTEGER PRIMARY KEY, value TEXT NOT NULL)"
		);
		const insert = env.DB.prepare("INSERT INTO entries (value) VALUES (?)");
		const batch = await env.DB.batch([insert.bind("a"), insert.bind("b")]);
		const select = env.DB.prepare(
			"SELECT id, value AS constructor FROM entries"
		);
		return {
			batch: batch.map(
				(/** @type {{ meta: { changes: number } }} */ result) =>
					result.meta.changes
			),
			all: (await select.all()).results,
			first: await env.DB.prepare("SELECT value FROM entries WHERE id = ?")
				.bind(2)
				.first("value"),
			raw: await select.raw({ columnNames: true }),
			invalid: await catchError(env.DB.prepare("SELECT * FROM missing").all()),
			constraint: await catchError(insert.bind(null).run()),
		};
	},

	async d1Session(env) {
		const session = env.DB.withSession("first-primary");
		const bookmark = session.getBookmark();
		await session.prepare("SELECT 1").all();
		const bookmarkAfter = session.getBookmark();
		return {
			bookmark,
			bookmarkAfter: typeof bookmarkAfter,
			resumed:
				env.DB.withSession(bookmarkAfter).getBookmark() === bookmarkAfter,
		};
	},

	async durableObject(env) {
		const id = env.OBJECT.idFromName("name");
		const stub = env.OBJECT.get(id);
		const fromString = env.OBJECT.idFromString(id.toString());
		const byName = env.OBJECT.getByName("name");
		const unique = env.OBJECT.newUniqueId();
		const ordered = env.OBJECT.getByName("ordered");
		// Calls are delivered in order, even if earlier ones send more data
		const set = ordered.set("x".repeat(100_000));
		const orderedLength = (await ordered.get())?.length;
		await set;
		const remembering = env.OBJECT.getByName("remembering");
		await remembering.remember((/** @type {string} */ v) => `called ${v}`);
		let invalidId;
		try {
			env.OBJECT.idFromString("invalid");
		} catch (e) {
			invalidId = e;
		}
		return {
			id: { name: id.name, string: id.toString() },
			fromString: { name: fromString.name, equals: fromString.equals(id) },
			stub: { name: stub.name, idName: stub.id.name },
			byName: { name: byName.name, equals: byName.id.equals(id) },
			// Unique IDs differ between Miniflare instances
			unique: {
				name: unique.name,
				equals: env.OBJECT.idFromString(unique.toString()).equals(unique),
				echo: await env.OBJECT.get(unique).echo("unique"),
			},
			invalidId,
			echo: await stub.echo(new Map([["key", new Set([1])]])),
			fetch: await (await stub.fetch("https://example.com/path")).text(),
			// Names with characters that aren't allowed in headers
			fetchNonAscii: await (
				await env.OBJECT.getByName("名前").fetch("https://example.com/")
			).text(),
			upperCaseId: env.OBJECT.idFromString(id.toString().toUpperCase()).equals(
				id
			),
			orderedLength,
			remembered: await remembering.callRemembered(),
			error: await catchError(stub.fail()),
		};
	},

	async serviceBinding(env) {
		const value = {
			map: new Map([[1, { constructor: "nested", toJSON: "nested" }]]),
			set: new Set(["a"]),
			regexp: /a+/gi,
			date: new Date(0),
			bytes: new Uint8Array([1, 2]),
			uint16: new Uint16Array([1, 2]),
			buffer: new Uint8Array([3]).buffer,
			constructor: "key",
			bigint: 1n,
			undefined: undefined,
			blob: new Blob(["blob"], { type: "text/plain" }),
			headers: new Headers([
				["Set-Cookie", "a=1"],
				["Set-Cookie", "b=2"],
			]),
		};
		const counter = await env.SERVICE.getCounter();
		return {
			echo: await env.SERVICE.echo(value),
			large: (await env.SERVICE.echo("x".repeat(100_000))).length,
			property: await env.SERVICE.property,
			propertyArgument: await catchError(
				(async () => env.SERVICE.echo(env.SERVICE.property))()
			),
			pipelined: await env.SERVICE.getCounter().increment(),
			stubArgument: await env.SERVICE.increment(counter),
			stubAfterArgument: await catchError(counter.increment()),
			callback: await env.SERVICE.callback(
				(/** @type {string} */ v) => new Map([[v, v]])
			),
			error: await catchError(env.SERVICE.fail()),
			callbackError: await env.SERVICE.callbackError(() => {
				const error = new Error("callback failure");
				error.name = "CallbackError";
				throw error;
			}),
		};
	},

	async queue(env) {
		return {
			send: await env.QUEUE.send({ constructor: "body" }),
			sendBatch: await env.QUEUE.sendBatch([{ body: "body" }]),
		};
	},

	async rateLimit(env) {
		return {
			first: await env.RATE_LIMIT.limit({ key: "key" }),
			second: await env.RATE_LIMIT.limit({ key: "key" }),
		};
	},

	async workflow(env) {
		const instance = await env.WORKFLOW.create({ id: "instance" });
		const got = await env.WORKFLOW.get("instance");
		return {
			id: instance.id,
			gotId: got.id,
			duplicate: await catchError(env.WORKFLOW.create({ id: "instance" })),
		};
	},

	async analyticsEngine(env) {
		return env.ANALYTICS.writeDataPoint({ blobs: ["blob"], doubles: [1] });
	},

	async cache(_env, caches) {
		const url = "https://example.com/";
		const cache = caches.default;
		await cache.put(
			url,
			new Response("body", { headers: { "Cache-Control": "max-age=60" } })
		);
		const match = await cache.match(url);
		const named = await caches.open("named");
		return {
			match: { status: match.status, body: await match.text() },
			deleted: await cache.delete(url),
			missing: await named.match(url),
		};
	},

	async images(env) {
		const stream = () => new Blob([PNG]).stream();
		const result = await env.IMAGES.input(stream())
			.transform({ width: 1 })
			.output({ format: "image/png" });
		const response = result.response();
		return {
			info: await env.IMAGES.info(stream()),
			contentType: result.contentType(),
			response: response.headers.get("Content-Type"),
		};
	},
};

/**
 * Describes a value as JSON, so values from the Worker and Node.js can be
 * compared.
 *
 * @param {any} value Value to describe
 * @returns {Promise<unknown>} JSON-serialisable description of `value`
 */
export async function describe(value) {
	if (value === undefined) {
		return { type: "undefined" };
	}
	if (typeof value === "bigint") {
		return { type: "bigint", value: String(value) };
	}
	if (typeof value === "function") {
		return { type: "function" };
	}
	if (value === null || typeof value !== "object") {
		return value;
	}
	if (Array.isArray(value)) {
		return Promise.all(value.map(describe));
	}
	// `workerd` and Node.js define different properties on `DOMException`s
	if (Object.prototype.toString.call(value) === "[object DOMException]") {
		return { type: "DOMException", name: value.name, message: value.message };
	}
	if (value instanceof Error) {
		/** @type {Record<string, unknown>} */
		const properties = {};
		for (const key of Object.keys(value)) {
			// Whether `cause` is enumerable depends on how the error was created, and
			// `workerd` adds the ID of the Durable Object that catches an error, which
			// for Node.js is `ProxyServer`
			if (key !== "cause" && key !== "durableObjectId") {
				properties[key] = await describe(Reflect.get(value, key));
			}
		}
		return {
			type: "Error",
			class: value.constructor.name,
			name: value.name,
			message: value.message,
			properties,
			cause: await describe(value.cause),
		};
	}
	if (ArrayBuffer.isView(value)) {
		const bytes = new Uint8Array(
			value.buffer,
			value.byteOffset,
			value.byteLength
		);
		return { type: value.constructor.name, bytes: Array.from(bytes) };
	}
	// Compare tags, as Node.js has several implementations of these classes
	const tag = Object.prototype.toString.call(value).slice(8, -1);
	switch (tag) {
		case "Map":
			return { type: tag, entries: await describe(Array.from(value)) };
		case "Set":
			return { type: tag, values: await describe(Array.from(value)) };
		case "RegExp":
			return { type: tag, source: value.source, flags: value.flags };
		case "Date":
			return { type: tag, time: value.getTime() };
		case "ArrayBuffer":
			return { type: tag, bytes: Array.from(new Uint8Array(value)) };
		case "File":
			return {
				type: tag,
				name: value.name,
				mimeType: value.type,
				lastModified: value.lastModified,
				text: await value.text(),
			};
		case "Blob":
			return { type: tag, mimeType: value.type, text: await value.text() };
		case "ReadableStream":
			return { type: tag, text: await new Response(value).text() };
		case "Headers":
			return { type: tag, entries: Array.from(value) };
	}
	const result = {};
	for (const key of Object.keys(value)) {
		// Define rather than assign, so `__proto__` isn't treated specially
		Object.defineProperty(result, key, {
			value: await describe(value[key]),
			enumerable: true,
		});
	}
	return result;
}
