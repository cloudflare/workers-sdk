import assert from "node:assert";
import { Blob } from "node:buffer";
import fs from "node:fs/promises";
import path from "node:path";
import consumers from "node:stream/consumers";
import {
	KV_PLUGIN_NAME,
	MAX_BULK_GET_KEYS,
	Miniflare,
	MiniflareOptions,
	ReplaceWorkersTypes,
} from "miniflare";
import { beforeEach, expect, test } from "vitest";
import {
	createJunkStream,
	FIXTURES_PATH,
	MiniflareDurableObjectControlStub,
	miniflareTest,
	MiniflareTestContext,
	namespace,
	Namespaced,
	useDispose,
	useTmp,
} from "../../test-shared";
import type {
	KVNamespace,
	KVNamespaceListOptions,
	KVNamespaceListResult,
} from "@cloudflare/workers-types/experimental";

function secondsToMillis(seconds: number): number {
	return seconds * 1000;
}

// Time in seconds the fake `Date.now()` always returns
export const TIME_NOW = 1000;
// Expiration value to signal a key that will expire in the future
export const TIME_FUTURE = 1500;

function sqlStmts(object: MiniflareDurableObjectControlStub) {
	return {
		getBlobIdByKey: async (key: string): Promise<string | undefined> => {
			const rows = await object.sqlQuery<{ blob_id: string }>(
				"SELECT blob_id FROM _mf_entries WHERE key = ?",
				key
			);
			return rows[0]?.blob_id;
		},
	};
}

interface Context extends MiniflareTestContext {
	ns: string;
	kv: Namespaced<ReplaceWorkersTypes<KVNamespace>>; // :D
	object: MiniflareDurableObjectControlStub;
}

const opts: Partial<MiniflareOptions> = {
	kvNamespaces: { NAMESPACE: "namespace" },
};
const ctx = miniflareTest<unknown, Context>(opts, async (global) => {
	return new global.Response(null, { status: 404 });
});

beforeEach(async () => {
	// Namespace keys so tests which are accessing the same Miniflare instance
	// and bucket don't have races from key collisions
	const ns = `${Date.now()}_${Math.floor(
		Math.random() * Number.MAX_SAFE_INTEGER
	)}`;
	ctx.ns = ns;
	ctx.kv = namespace(ns, await ctx.mf.getKVNamespace("NAMESPACE"));

	// Enable fake timers
	const objectNamespace = await ctx.mf._getInternalDurableObjectNamespace(
		KV_PLUGIN_NAME,
		"kv:ns",
		"KVNamespaceObject"
	);
	const objectId = objectNamespace.idFromName("namespace");
	const objectStub = objectNamespace.get(objectId);
	ctx.object = new MiniflareDurableObjectControlStub(objectStub);
	await ctx.object.enableFakeTimers(secondsToMillis(TIME_NOW));
});

async function testValidatesKey(opts: {
	method: string;
	f: (kv: ReplaceWorkersTypes<KVNamespace>, key?: any) => Promise<void>;
}) {
	const { kv } = ctx;
	kv.ns = "";
	await expect(opts.f(kv, "")).rejects.toThrow(
		new TypeError("Key name cannot be empty.")
	);
	await expect(opts.f(kv, ".")).rejects.toThrow(
		new TypeError('"." is not allowed as a key name.')
	);
	await expect(opts.f(kv, "..")).rejects.toThrow(
		new TypeError('".." is not allowed as a key name.')
	);
	await expect(opts.f(kv, "".padStart(513, "x"))).rejects.toThrow(
		new Error(
			`KV ${opts.method.toUpperCase()} failed: 414 UTF-8 encoded length of 513 exceeds key length limit of 512.`
		)
	);
}

test("get: validates key", async () => {
	await testValidatesKey({
		method: "get",
		f: async (kv, key) => {
			await kv.get(key);
		},
	});
});
test("get: returns value", async () => {
	const { kv } = ctx;
	await kv.put("key", "value");
	const result = await kv.get("key");
	expect(result).toBe("value");
});

test("bulk get: returns value", async () => {
	const { kv } = ctx;
	await kv.put("key1", "value1");
	const result: any = await kv.get(["key1", "key2"]);
	const expectedResult = new Map([
		["key1", "value1"],
		["key2", null],
	]);

	expect(result).toEqual(expectedResult);
});

test("bulk get: check max keys", async () => {
	const { kv } = ctx;
	await kv.put("key1", "value1");
	const keyArray = [];
	for (let i = 0; i <= MAX_BULK_GET_KEYS; i++) {
		keyArray.push(`key${i}`);
	}
	try {
		await kv.get(keyArray);
	} catch (error: any) {
		expect(error.message).toBe(
			"KV GET_BULK failed: 400 You can request a maximum of 100 keys"
		);
	}
});

test("bulk get: check minimum keys", async () => {
	const { kv } = ctx;
	try {
		await kv.get([]);
	} catch (error: any) {
		expect(error.message).toBe(
			"KV GET_BULK failed: 400 You must request a minimum of 1 key"
		);
	}
});

test("bulk get: invalid type", async () => {
	const { kv } = ctx;
	try {
		await kv.get(["key"], { type: "invalid" as "json" });
	} catch (error: any) {
		expect(error.message).toBe(
			'KV GET_BULK failed: 400 "invalid" is not a valid type. Use "json" or "text"'
		);
	}
});

test("bulk get: request json type", async () => {
	const { kv } = ctx;
	await kv.put("key1", '{"example": "ex"}');
	await kv.put("key2", "example");
	let result: any = await kv.get(["key1"]);
	let expectedResult: any = new Map([["key1", '{"example": "ex"}']]);
	expectedResult = new Map([["key1", '{"example": "ex"}']]);
	expect(result).toEqual(expectedResult);

	result = await kv.get(["key1"], "json");
	expectedResult = new Map([["key1", { example: "ex" }]]);
	expect(result).toEqual(expectedResult);

	try {
		await kv.get(["key1", "key2"], "json");
	} catch (error: any) {
		expect(error.message).toBe(
			"KV GET_BULK failed: 400 At least one of the requested keys corresponds to a non-json value"
		);
	}
});

test("bulk get: check metadata", async () => {
	const { kv } = ctx;
	await kv.put("key1", "value1", {
		expiration: TIME_FUTURE,
		metadata: { testing: true },
	});

	await kv.put("key2", "value2");
	const result: any = await kv.getWithMetadata(["key1", "key2"]);
	const expectedResult: any = new Map([
		["key1", { value: "value1", metadata: { testing: true } }],
		["key2", { value: "value2", metadata: null }],
	]);
	expect(result).toEqual(expectedResult);
});

test("bulk get: check metadata with int", async () => {
	const { kv } = ctx;
	await kv.put("key1", "value1", {
		expiration: TIME_FUTURE,
		metadata: 123,
	});

	const result: any = await kv.getWithMetadata(["key1"]);
	const expectedResult: any = new Map([
		["key1", { value: "value1", metadata: 123 }],
	]);
	expect(result).toEqual(expectedResult);
});

test("bulk get: check metadata as string", async () => {
	const { kv } = ctx;
	await kv.put("key1", "value1", {
		expiration: TIME_FUTURE,
		metadata: "example",
	});
	const result: any = await kv.getWithMetadata(["key1"]);
	const expectedResult: any = new Map([
		["key1", { value: "value1", metadata: "example" }],
	]);
	expect(result).toEqual(expectedResult);
});

test("bulk get: get with metadata for 404", async () => {
	const { kv } = ctx;

	const result: any = await kv.getWithMetadata(["key1"]);
	const expectedResult: any = new Map([["key1", null]]);
	expect(result).toEqual(expectedResult);
});

test("bulk get: get over size limit", async () => {
	const { kv } = ctx;
	const bigValue = new Array(1024).fill("x").join("");
	await kv.put("key1", bigValue);
	await kv.put("key2", bigValue);
	try {
		await kv.getWithMetadata(["key1", "key2"]);
	} catch (error: any) {
		expect(error.message).toEqual(
			"KV GET_BULK failed: 413 Total size of request exceeds the limit of 0.0009765625MB" // 1024 Bytes for testing
		);
	}
});

test("get: returns null for non-existent keys", async () => {
	const { kv } = ctx;
	expect(await kv.get("key")).toBe(null);
});
test("get: returns null for expired keys", async () => {
	const { kv, object } = ctx;
	await kv.put("key", "value", { expirationTtl: 60 });
	expect(await kv.get("key")).not.toBe(null);
	await object.advanceFakeTime(60_000);
	expect(await kv.get("key")).toBe(null);
});
test("get: validates but ignores cache ttl", async () => {
	const { kv } = ctx;
	await kv.put("key", "value");
	await expect(
		kv.get("key", { cacheTtl: "not a number" as any })
	).rejects.toThrow(
		new Error(
			"KV GET failed: 400 Invalid cache_ttl of 0. Cache TTL must be at least 30."
		)
	);
	await expect(kv.get("key", { cacheTtl: 10 })).rejects.toThrow(
		new Error(
			"KV GET failed: 400 Invalid cache_ttl of 10. Cache TTL must be at least 30."
		)
	);
	expect(await kv.get("key", { cacheTtl: 30 })).toBeDefined();
	expect(await kv.get("key", { cacheTtl: 60 })).toBeDefined();
});

test("put: validates key", async () => {
	await testValidatesKey({
		method: "put",
		f: async (kv, key) => {
			await kv.put(key, "value");
		},
	});
});
test("put: puts value", async () => {
	const { kv, ns } = ctx;
	await kv.put("key", "value", {
		expiration: TIME_FUTURE,
		metadata: { testing: true },
	});
	const result = await kv.getWithMetadata("key");
	expect(result.value).toBe("value");
	expect(result.metadata).toEqual({ testing: true });
	// Check expiration set too
	const results = await kv.list({ prefix: ns });
	expect(results.keys[0]?.expiration).toBe(TIME_FUTURE);
});
test("put: puts empty value", async () => {
	// https://github.com/cloudflare/miniflare/issues/703
	const { kv } = ctx;
	await kv.put("key", "");
	const value = await kv.get("key");
	expect(value).toBe("");
});
test("put: overrides existing keys", async () => {
	const { kv, ns, object } = ctx;
	const stmts = sqlStmts(object);
	await kv.put("key", "value1");
	const blobId = await stmts.getBlobIdByKey(`${ns}key`);
	assert(blobId !== undefined);
	await kv.put("key", "value2", {
		expiration: TIME_FUTURE,
		metadata: { testing: true },
	});
	const result = await kv.getWithMetadata("key");
	expect(result.value).toBe("value2");
	expect(result.metadata).toEqual({ testing: true });

	// Check deletes old blob
	await object.waitForFakeTasks();
	expect(await object.getBlob(blobId)).toBe(null);

	// Check created new blob
	const newBlobId = await stmts.getBlobIdByKey(`${ns}key`);
	assert(newBlobId !== undefined);
	expect(blobId).not.toBe(newBlobId);
});
test("put: keys are case-sensitive", async () => {
	const { kv } = ctx;
	await kv.put("key", "lower");
	await kv.put("KEY", "upper");
	let result = await kv.get("key");
	expect(result).toBe("lower");
	result = await kv.get("KEY");
	expect(result).toBe("upper");
});
test("put: validates expiration ttl", async () => {
	const { kv } = ctx;
	await expect(
		kv.put("key", "value", { expirationTtl: "nan" as unknown as number })
	).rejects.toThrow(
		new Error(
			"KV PUT failed: 400 Invalid expiration_ttl of 0. Please specify integer greater than 0."
		)
	);
	await expect(kv.put("key", "value", { expirationTtl: 0 })).rejects.toThrow(
		new Error(
			"KV PUT failed: 400 Invalid expiration_ttl of 0. Please specify integer greater than 0."
		)
	);
	await expect(kv.put("key", "value", { expirationTtl: 30 })).rejects.toThrow(
		new Error(
			"KV PUT failed: 400 Invalid expiration_ttl of 30. Expiration TTL must be at least 60."
		)
	);
});
test("put: validates expiration", async () => {
	const { kv } = ctx;
	await expect(
		kv.put("key", "value", { expiration: "nan" as unknown as number })
	).rejects.toThrow(
		new Error(
			"KV PUT failed: 400 Invalid expiration of 0. Please specify integer greater than the current number of seconds since the UNIX epoch."
		)
	);
	await expect(
		kv.put("key", "value", { expiration: TIME_NOW })
	).rejects.toThrow(
		new Error(
			`KV PUT failed: 400 Invalid expiration of ${TIME_NOW}. Please specify integer greater than the current number of seconds since the UNIX epoch.`
		)
	);
	await expect(
		kv.put("key", "value", { expiration: TIME_NOW + 30 })
	).rejects.toThrow(
		new Error(
			`KV PUT failed: 400 Invalid expiration of ${TIME_NOW + 30}. Expiration times must be at least 60 seconds in the future.`
		)
	);
});
test("put: validates value size", async () => {
	const { kv } = ctx;
	const maxValueSize = 1024;
	const byteLength = maxValueSize + 1;
	// Check with and without `valueLengthHint`
	await expect(kv.put("key", createJunkStream(byteLength))).rejects.toThrow(
		new Error(
			`KV PUT failed: 413 Value length of ${byteLength} exceeds limit of ${maxValueSize}.`
		)
	);
	// Check 1 less byte is accepted
	await kv.put("key", createJunkStream(byteLength - 1));
});
test("put: validates metadata size", async () => {
	const { kv } = ctx;
	const maxMetadataSize = 1024;
	await expect(
		kv.put("key", new Blob(["value"]).stream(), {
			metadata: {
				key: "".padStart(maxMetadataSize - `{"key":""}`.length + 1, "x"),
			},
		})
	).rejects.toThrow(
		new Error(
			`KV PUT failed: 413 Metadata length of ${maxMetadataSize + 1} exceeds limit of ${maxMetadataSize}.`
		)
	);
});

test("delete: validates key", async () => {
	await testValidatesKey({
		method: "delete",
		f: async (kv, key) => {
			await kv.delete(key);
		},
	});
});
test("delete: deletes existing keys", async () => {
	const { kv } = ctx;
	await kv.put("key", "value");
	expect(await kv.get("key")).not.toBe(null);
	await kv.delete("key");
	expect(await kv.get("key")).toBe(null);
});
test("delete: does nothing for non-existent keys", async () => {
	const { kv } = ctx;
	await kv.delete("key");
});

async function testList(opts: {
	values: Record<
		string,
		{ value: string; expiration?: number; metadata?: unknown }
	>;
	options?: KVNamespaceListOptions;
	pages: KVNamespaceListResult<unknown>["keys"][];
}) {
	const { kv, ns } = ctx;
	for (const [key, value] of Object.entries(opts.values)) {
		await kv.put(key, value.value, {
			expiration: value.expiration,
			metadata: value.metadata,
		});
	}

	const options = opts.options ?? {};
	let lastCursor = "";
	for (let i = 0; i < opts.pages.length; i++) {
		const result = await kv.list({
			prefix: ns + (options.prefix ?? ""),
			limit: options.limit,
			cursor: options.cursor ?? lastCursor,
		});
		expect(result.keys).toEqual(
			opts.pages[i].map((value) => ({
				...value,
				name: ns + value.name,
			}))
		);
		if (i === opts.pages.length - 1) {
			// Last Page
			assert(result.list_complete && !("cursor" in result));
			lastCursor = "";
		} else {
			// noinspection SuspiciousTypeOfGuard
			assert(!result.list_complete && typeof result.cursor === "string");
			lastCursor = result.cursor;
		}
	}
}

test("list: lists keys in sorted order", async () => {
	await testList({
		values: {
			key3: { value: "value3" },
			key1: { value: "value1" },
			key2: { value: "value2" },
		},
		pages: [[{ name: "key1" }, { name: "key2" }, { name: "key3" }]],
	});
});
test("list: lists keys matching prefix", async () => {
	await testList({
		values: {
			section1key1: { value: "value11" },
			section1key2: { value: "value12" },
			section2key1: { value: "value21" },
		},
		options: { prefix: "section1" },
		pages: [[{ name: "section1key1" }, { name: "section1key2" }]],
	});
});
test("list: prefix is case-sensitive", async () => {
	await testList({
		values: {
			key1: { value: "lower1" },
			key2: { value: "lower2 " },
			KEY1: { value: "upper1" },
			KEY2: { value: "upper2" },
		},
		options: { prefix: "KEY" },
		pages: [[{ name: "KEY1" }, { name: "KEY2" }]],
	});
});
test("list: prefix permits special characters", async () => {
	await testList({
		values: {
			["key\\_%1"]: { value: "value1" },
			["key\\a"]: { value: "bad1" },
			["key\\_%2"]: { value: "value2" },
			["key\\bbb"]: { value: "bad2" },
			["key\\_%3"]: { value: "value3" },
		},
		options: { prefix: "key\\_%" },
		pages: [[{ name: "key\\_%1" }, { name: "key\\_%2" }, { name: "key\\_%3" }]],
	});
});
test("list: lists keys with expiration", async () => {
	await testList({
		values: {
			key1: { value: "value1", expiration: TIME_FUTURE },
			key2: { value: "value2", expiration: TIME_FUTURE + 100 },
			key3: { value: "value3", expiration: TIME_FUTURE + 200 },
		},
		pages: [
			[
				{ name: "key1", expiration: TIME_FUTURE },
				{ name: "key2", expiration: TIME_FUTURE + 100 },
				{ name: "key3", expiration: TIME_FUTURE + 200 },
			],
		],
	});
});
test("list: lists keys with metadata", async () => {
	await testList({
		values: {
			key1: { value: "value1", metadata: { testing: 1 } },
			key2: { value: "value2", metadata: { testing: 2 } },
			key3: { value: "value3", metadata: { testing: 3 } },
		},
		pages: [
			[
				{ name: "key1", metadata: { testing: 1 } },
				{ name: "key2", metadata: { testing: 2 } },
				{ name: "key3", metadata: { testing: 3 } },
			],
		],
	});
});
test("list: lists keys with expiration and metadata", async () => {
	await testList({
		values: {
			key1: {
				value: "value1",
				expiration: TIME_FUTURE,
				metadata: { testing: 1 },
			},
			key2: {
				value: "value2",
				expiration: TIME_FUTURE + 100,
				metadata: { testing: 2 },
			},
			key3: {
				value: "value3",
				expiration: TIME_FUTURE + 200,
				metadata: { testing: 3 },
			},
		},
		pages: [
			[
				{
					name: "key1",
					expiration: TIME_FUTURE,
					metadata: { testing: 1 },
				},
				{
					name: "key2",
					expiration: TIME_FUTURE + 100,
					metadata: { testing: 2 },
				},
				{
					name: "key3",
					expiration: TIME_FUTURE + 200,
					metadata: { testing: 3 },
				},
			],
		],
	});
});
test("list: returns an empty list with no keys", async () => {
	await testList({
		values: {},
		pages: [[]],
	});
});
test("list: returns an empty list with no matching keys", async () => {
	await testList({
		values: {
			key1: { value: "value1" },
			key2: { value: "value2" },
			key3: { value: "value3" },
		},
		options: { prefix: "none" },
		pages: [[]],
	});
});
test("list: paginates keys", async () => {
	await testList({
		values: {
			key1: { value: "value1" },
			key2: { value: "value2" },
			key3: { value: "value3" },
		},
		options: { limit: 2 },
		pages: [[{ name: "key1" }, { name: "key2" }], [{ name: "key3" }]],
	});
});
test("list: paginates keys matching prefix", async () => {
	await testList({
		values: {
			section1key1: { value: "value11" },
			section1key2: { value: "value12" },
			section1key3: { value: "value13" },
			section2key1: { value: "value21" },
		},
		options: { prefix: "section1", limit: 2 },
		pages: [
			[{ name: "section1key1" }, { name: "section1key2" }],
			[{ name: "section1key3" }],
		],
	});
});
test("list: accepts long prefix", async () => {
	const { kv, ns } = ctx;
	// Max key length, minus padding for `context.ns`
	const longKey = "x".repeat(512 - ns.length);
	await kv.put(longKey, "value");
	const page = await kv.list({ prefix: ns + longKey });
	expect(page.keys).toEqual([{ name: ns + longKey }]);
});
test("list: paginates with variable limit", async () => {
	const { kv, ns } = ctx;
	await kv.put("key1", "value1");
	await kv.put("key2", "value2");
	await kv.put("key3", "value3");

	// Get first page
	let page = await kv.list({ prefix: ns, limit: 1 });
	expect(page.keys).toEqual([{ name: `${ns}key1` }]);
	assert(!page.list_complete);
	expect(page.cursor).toBeDefined();

	// Get second page with different limit
	page = await kv.list({ prefix: ns, limit: 2, cursor: page.cursor });
	expect(page.keys).toEqual([{ name: `${ns}key2` }, { name: `${ns}key3` }]);
	assert(page.list_complete);
});
test("list: returns keys inserted whilst paginating", async () => {
	const { kv, ns } = ctx;
	await kv.put("key1", "value1");
	await kv.put("key3", "value3");
	await kv.put("key5", "value5");

	// Get first page
	let page = await kv.list({ prefix: ns, limit: 2 });
	expect(page.keys).toEqual([{ name: `${ns}key1` }, { name: `${ns}key3` }]);
	assert(!page.list_complete);
	expect(page.cursor).toBeDefined();

	// Insert key2 and key4
	await kv.put("key2", "value2");
	await kv.put("key4", "value4");

	// Get second page, expecting to see key4 but not key2
	page = await kv.list({ prefix: ns, limit: 2, cursor: page.cursor });
	expect(page.keys).toEqual([{ name: `${ns}key4` }, { name: `${ns}key5` }]);
	assert(page.list_complete);
});
test("list: ignores expired keys", async () => {
	const { kv, ns, object } = ctx;
	for (let i = 1; i <= 3; i++) {
		await kv.put(`key${i}`, `value${i}`, { expiration: TIME_NOW + i * 60 });
	}
	await object.advanceFakeTime(130_000 /* 2m10s */);
	expect(await kv.list({ prefix: ns })).toEqual({
		keys: [{ name: `${ns}key3`, expiration: TIME_NOW + 3 * 60 }],
		list_complete: true,
		cacheStatus: null,
	});
});
test("list: sorts lexicographically", async () => {
	const { kv, ns } = ctx;
	await kv.put(", ", "value");
	await kv.put("!", "value");
	expect(await kv.list({ prefix: ns })).toEqual({
		keys: [{ name: `${ns}!` }, { name: `${ns}, ` }],
		list_complete: true,
		cacheStatus: null,
	});
});
test("list: validates limit", async () => {
	const { kv } = ctx;
	// The runtime will only send the limit if it's > 0
	await expect(kv.list({ limit: 1001 })).rejects.toThrow(
		new Error(
			"KV GET failed: 400 Invalid key_count_limit of 1001. Please specify an integer less than 1000."
		)
	);
});

test("persists in-memory between options reloads", async () => {
	const opts = {
		modules: true,
		script: `export default {
      async fetch(request, env) {
        return Response.json({ version: env.VERSION, key: await env.NAMESPACE.get("key") });
      }
    }`,
		bindings: { VERSION: 1 },
		kvNamespaces: { NAMESPACE: "namespace" },
	} satisfies MiniflareOptions;
	const mf1 = new Miniflare(opts);
	useDispose(mf1);

	const kv1 = await mf1.getKVNamespace("NAMESPACE");
	await kv1.put("key", "value1");
	let res = await mf1.dispatchFetch("http://placeholder");
	expect(await res.json()).toEqual({ version: 1, key: "value1" });

	opts.bindings.VERSION = 2;
	await mf1.setOptions(opts);
	res = await mf1.dispatchFetch("http://placeholder");
	expect(await res.json()).toEqual({ version: 2, key: "value1" });

	// Check a `new Miniflare()` instance has its own in-memory storage
	opts.bindings.VERSION = 3;
	const mf2 = new Miniflare(opts);
	useDispose(mf2);
	const kv2 = await mf2.getKVNamespace("NAMESPACE");
	await kv2.put("key", "value2");

	res = await mf1.dispatchFetch("http://placeholder");
	expect(await res.json()).toEqual({ version: 2, key: "value1" });
	res = await mf2.dispatchFetch("http://placeholder");
	expect(await res.json()).toEqual({ version: 3, key: "value2" });
});
test("persists on file-system", async () => {
	const tmp = await useTmp();
	const opts: MiniflareOptions = {
		modules: true,
		script: "",
		kvNamespaces: { NAMESPACE: "namespace" },
		kvPersist: tmp,
	};
	let mf = new Miniflare(opts);
	useDispose(mf);

	let kv = await mf.getKVNamespace("NAMESPACE");
	await kv.put("key", "value");
	expect(await kv.get("key")).toBe("value");

	// Check directory created for namespace
	const names = await fs.readdir(tmp);
	expect(names.includes("miniflare-KVNamespaceObject")).toBe(true);

	// Check "restarting" keeps persisted data
	await mf.dispose();
	mf = new Miniflare(opts);
	useDispose(mf);
	kv = await mf.getKVNamespace("NAMESPACE");
	expect(await kv.get("key")).toBe("value");
});

test("migrates database to new location", async () => {
	// Copy legacy data to temporary directory
	const tmp = await useTmp();
	const persistFixture = path.join(FIXTURES_PATH, "migrations", "3.20230821.0");
	const kvPersist = path.join(tmp, "kv");
	await fs.cp(path.join(persistFixture, "kv"), kvPersist, { recursive: true });

	// Implicitly migrate data
	const mf = new Miniflare({
		modules: true,
		script: "",
		kvNamespaces: ["NAMESPACE"],
		kvPersist,
	});
	useDispose(mf);

	const namespace = await mf.getKVNamespace("NAMESPACE");
	expect(await namespace.get("key")).toBe("value");
});

test("sticky blobs never deleted", async () => {
	// Checking regular behaviour that old blobs deleted in `put: overrides
	// existing keys` test. Only testing sticky blobs for KV, as the blob store
	// should only be constructed in the shared `MiniflareDurableObject` ABC.

	// Create instance with sticky blobs enabled (can't use `ctx.mf`)
	const mf = new Miniflare({
		script: "",
		modules: true,
		kvNamespaces: ["NAMESPACE"],
		unsafeStickyBlobs: true,
	});
	useDispose(mf);

	// Create control stub for newly created instance's namespace
	const objectNamespace = await mf._getInternalDurableObjectNamespace(
		KV_PLUGIN_NAME,
		"kv:ns",
		"KVNamespaceObject"
	);
	const objectId = objectNamespace.idFromName("NAMESPACE");
	const objectStub = objectNamespace.get(objectId);
	const object = new MiniflareDurableObjectControlStub(objectStub);
	await object.enableFakeTimers(secondsToMillis(TIME_NOW));
	const stmts = sqlStmts(object);

	// Store something in the namespace and get the blob ID
	const ns = await mf.getKVNamespace("NAMESPACE");
	await ns.put("key", "value 1");
	const blobId = await stmts.getBlobIdByKey("key");
	assert(blobId !== undefined);

	// Override key and check we can still access the old blob
	await ns.put("key", "value 2");
	await object.waitForFakeTasks();
	const blob = await object.getBlob(blobId);
	assert(blob !== null);
	expect(await consumers.text(blob)).toBe("value 1");
});
