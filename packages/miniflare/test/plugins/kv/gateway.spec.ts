import {
	KVError,
	KVGateway,
	KVGatewayListOptions,
	MemoryStorage,
	Storage,
	StoredKeyMeta,
	StoredValueMeta,
	base64Encode,
} from "@miniflare/tre";
import anyTest, { Macro, TestFn } from "ava";
import {
	TIME_EXPIRED,
	TIME_EXPIRING,
	TIME_NOW,
	testClock,
	utf8Encode,
} from "../../storage/helpers";

interface Context {
	storage: Storage;
	gateway: KVGateway;
}

const test = anyTest as TestFn<Context>;

test.beforeEach((t) => {
	const storage = new MemoryStorage(undefined, testClock);
	const gateway = new KVGateway(storage, testClock);
	t.context = { storage, gateway };
});

const validatesKeyMacro: Macro<
	[method: string, func: (gateway: KVGateway, key?: any) => Promise<void>],
	Context
> = {
	title(providedTitle, method) {
		return `${method}: validates key`;
	},
	async exec(t, method, func) {
		const { gateway } = t.context;
		await t.throwsAsync(func(gateway, ""), {
			instanceOf: KVError,
			code: 400,
			message: "Key names must not be empty",
		});
		await t.throwsAsync(func(gateway, "."), {
			instanceOf: KVError,
			code: 400,
			message: 'Illegal key name ".". Please use a different name.',
		});
		await t.throwsAsync(func(gateway, ".."), {
			instanceOf: KVError,
			code: 400,
			message: 'Illegal key name "..". Please use a different name.',
		});
		await t.throwsAsync(func(gateway, "".padStart(513, "x")), {
			instanceOf: KVError,
			code: 414,
			message: "UTF-8 encoded length of 513 exceeds key length limit of 512.",
		});
	},
};

test(validatesKeyMacro, "get", async (gateway, key) => {
	await gateway.get(key);
});
test("get: returns value", async (t) => {
	const { storage, gateway } = t.context;
	await storage.put("key", {
		value: utf8Encode("value"),
		metadata: { testing: true },
	});
	t.deepEqual(await gateway.get("key"), {
		value: utf8Encode("value"),
		expiration: undefined,
		metadata: { testing: true },
	});
});
test("get: returns undefined for non-existent keys", async (t) => {
	const { gateway } = t.context;
	t.is(await gateway.get("key"), undefined);
});
test("get: returns undefined for expired keys", async (t) => {
	const { storage, gateway } = t.context;
	await storage.put("key", {
		value: utf8Encode("value"),
		expiration: TIME_EXPIRED,
	});
	t.is(await gateway.get("key"), undefined);
});
test("get: validates but ignores cache ttl", async (t) => {
	const { storage, gateway } = t.context;
	await storage.put("key", { value: utf8Encode("value") });
	await t.throwsAsync(gateway.get("key", { cacheTtl: "not a number" as any }), {
		instanceOf: KVError,
		code: 400,
		message:
			"Invalid cache_ttl of not a number. Cache TTL must be at least 60.",
	});
	await t.throwsAsync(gateway.get("key", { cacheTtl: 10 }), {
		instanceOf: KVError,
		code: 400,
		message: "Invalid cache_ttl of 10. Cache TTL must be at least 60.",
	});
	t.not(await gateway.get("key", { cacheTtl: 60 }), undefined);
});

test(validatesKeyMacro, "put", async (gateway, key) => {
	await gateway.put(key, utf8Encode("value"));
});
test("put: puts value", async (t) => {
	const { storage, gateway } = t.context;
	await gateway.put("key", utf8Encode("value"), {
		expiration: TIME_EXPIRING,
		metadata: { testing: true },
	});
	t.deepEqual(await storage.get("key"), {
		value: utf8Encode("value"),
		expiration: TIME_EXPIRING,
		metadata: { testing: true },
	});
});
test("put: overrides existing keys", async (t) => {
	const { storage, gateway } = t.context;
	await gateway.put("key", utf8Encode("value1"));
	await gateway.put("key", utf8Encode("value2"), {
		expiration: TIME_EXPIRING,
		metadata: { testing: true },
	});
	t.deepEqual(await storage.get("key"), {
		value: utf8Encode("value2"),
		expiration: TIME_EXPIRING,
		metadata: { testing: true },
	});
});
test("put: validates expiration ttl", async (t) => {
	const { gateway } = t.context;
	const value = utf8Encode("value");
	await t.throwsAsync(gateway.put("key", value, { expirationTtl: "nan" }), {
		instanceOf: KVError,
		code: 400,
		message:
			"Invalid expiration_ttl of nan. Please specify integer greater than 0.",
	});
	await t.throwsAsync(gateway.put("key", value, { expirationTtl: 0 }), {
		instanceOf: KVError,
		code: 400,
		message:
			"Invalid expiration_ttl of 0. Please specify integer greater than 0.",
	});
	await t.throwsAsync(gateway.put("key", value, { expirationTtl: 30 }), {
		instanceOf: KVError,
		code: 400,
		message:
			"Invalid expiration_ttl of 30. Expiration TTL must be at least 60.",
	});
});
test("put: validates expiration", async (t) => {
	const { gateway } = t.context;
	const value = utf8Encode("value");
	await t.throwsAsync(gateway.put("key", value, { expiration: "nan" }), {
		instanceOf: KVError,
		code: 400,
		message:
			"Invalid expiration of nan. Please specify integer greater than the current number of seconds since the UNIX epoch.",
	});
	await t.throwsAsync(gateway.put("key", value, { expiration: TIME_NOW }), {
		instanceOf: KVError,
		code: 400,
		message: `Invalid expiration of ${TIME_NOW}. Please specify integer greater than the current number of seconds since the UNIX epoch.`,
	});
	await t.throwsAsync(
		gateway.put("key", value, { expiration: TIME_NOW + 30 }),
		{
			instanceOf: KVError,
			code: 400,
			message: `Invalid expiration of ${
				TIME_NOW + 30
			}. Expiration times must be at least 60 seconds in the future.`,
		}
	);
});
test("put: validates value size", async (t) => {
	const { gateway } = t.context;
	const maxValueSize = 25 * 1024 * 1024;
	const byteLength = maxValueSize + 1;
	await t.throwsAsync(gateway.put("key", new Uint8Array(byteLength)), {
		instanceOf: KVError,
		code: 413,
		message: `Value length of ${byteLength} exceeds limit of ${maxValueSize}.`,
	});
});
test("put: validates metadata size", async (t) => {
	const { gateway } = t.context;
	const maxMetadataSize = 1024;
	await t.throwsAsync(
		gateway.put("key", utf8Encode("value"), {
			metadata: {
				key: "".padStart(maxMetadataSize - `{\"key\":\"\"}`.length + 1, "x"),
			},
		}),
		{
			instanceOf: KVError,
			code: 413,
			message: `Metadata length of ${
				maxMetadataSize + 1
			} exceeds limit of ${maxMetadataSize}.`,
		}
	);
});

test(validatesKeyMacro, "delete", async (gateway, key) => {
	await gateway.delete(key);
});
test("delete: deletes existing keys", async (t) => {
	const { storage, gateway } = t.context;
	await storage.put("key", { value: utf8Encode("value") });
	t.not(await storage.get("key"), undefined);
	await gateway.delete("key");
	t.is(await storage.get("key"), undefined);
});
test("delete: does nothing for non-existent keys", async (t) => {
	const { gateway } = t.context;
	await gateway.delete("key");
	t.pass();
});

const listMacro: Macro<
	[
		{
			values: Record<string, StoredValueMeta>;
			options?: KVGatewayListOptions;
			pages: StoredKeyMeta[][];
		},
	],
	Context
> = {
	title(providedTitle) {
		return `list: ${providedTitle}`;
	},
	async exec(t, { values, options = {}, pages }) {
		const { storage, gateway } = t.context;
		for (const [key, value] of Object.entries(values)) {
			await storage.put(key, value);
		}

		let lastCursor = "";
		for (let i = 0; i < pages.length; i++) {
			const { keys, list_complete, cursor } = await gateway.list({
				prefix: options.prefix,
				limit: options.limit,
				cursor: options.cursor ?? lastCursor,
			});
			t.deepEqual(
				keys,
				pages[i].map((value) => ({
					expiration: undefined,
					metadata: undefined,
					...value,
				}))
			);
			if (i === pages.length - 1) {
				// Last Page
				t.true(list_complete);
				t.is(cursor, undefined);
			} else {
				t.false(list_complete);
				t.not(cursor, undefined);
			}
			lastCursor = cursor ?? "";
		}
	},
};
test("lists keys in sorted order", listMacro, {
	values: {
		key3: { value: utf8Encode("value3") },
		key1: { value: utf8Encode("value1") },
		key2: { value: utf8Encode("value2") },
	},
	pages: [[{ name: "key1" }, { name: "key2" }, { name: "key3" }]],
});
test("lists keys matching prefix", listMacro, {
	values: {
		section1key1: { value: utf8Encode("value11") },
		section1key2: { value: utf8Encode("value12") },
		section2key1: { value: utf8Encode("value21") },
	},
	options: { prefix: "section1" },
	pages: [[{ name: "section1key1" }, { name: "section1key2" }]],
});
test("lists keys with expiration", listMacro, {
	values: {
		key1: { value: utf8Encode("value1"), expiration: TIME_EXPIRING },
		key2: { value: utf8Encode("value2"), expiration: TIME_EXPIRING + 100 },
		key3: { value: utf8Encode("value3"), expiration: TIME_EXPIRING + 200 },
	},
	pages: [
		[
			{ name: "key1", expiration: TIME_EXPIRING },
			{ name: "key2", expiration: TIME_EXPIRING + 100 },
			{ name: "key3", expiration: TIME_EXPIRING + 200 },
		],
	],
});
test("lists keys with metadata", listMacro, {
	values: {
		key1: { value: utf8Encode("value1"), metadata: { testing: 1 } },
		key2: { value: utf8Encode("value2"), metadata: { testing: 2 } },
		key3: { value: utf8Encode("value3"), metadata: { testing: 3 } },
	},
	pages: [
		[
			{ name: "key1", metadata: { testing: 1 } },
			{ name: "key2", metadata: { testing: 2 } },
			{ name: "key3", metadata: { testing: 3 } },
		],
	],
});
test("lists keys with expiration and metadata", listMacro, {
	values: {
		key1: {
			value: utf8Encode("value1"),
			expiration: TIME_EXPIRING,
			metadata: { testing: 1 },
		},
		key2: {
			value: utf8Encode("value2"),
			expiration: TIME_EXPIRING + 100,
			metadata: { testing: 2 },
		},
		key3: {
			value: utf8Encode("value3"),
			expiration: TIME_EXPIRING + 200,
			metadata: { testing: 3 },
		},
	},
	pages: [
		[
			{
				name: "key1",
				expiration: TIME_EXPIRING,
				metadata: { testing: 1 },
			},
			{
				name: "key2",
				expiration: TIME_EXPIRING + 100,
				metadata: { testing: 2 },
			},
			{
				name: "key3",
				expiration: TIME_EXPIRING + 200,
				metadata: { testing: 3 },
			},
		],
	],
});
test("returns an empty list with no keys", listMacro, {
	values: {},
	pages: [[]],
});
test("returns an empty list with no matching keys", listMacro, {
	values: {
		key1: { value: utf8Encode("value1") },
		key2: { value: utf8Encode("value2") },
		key3: { value: utf8Encode("value3") },
	},
	options: { prefix: "none" },
	pages: [[]],
});
test("returns an empty list with an invalid cursor", listMacro, {
	values: {
		key1: { value: utf8Encode("value1") },
		key2: { value: utf8Encode("value2") },
		key3: { value: utf8Encode("value3") },
	},
	options: { cursor: base64Encode("bad") },
	pages: [[]],
});
test("paginates keys", listMacro, {
	values: {
		key1: { value: utf8Encode("value1") },
		key2: { value: utf8Encode("value2") },
		key3: { value: utf8Encode("value3") },
	},
	options: { limit: 2 },
	pages: [[{ name: "key1" }, { name: "key2" }], [{ name: "key3" }]],
});
test("paginates keys matching prefix", listMacro, {
	values: {
		section1key1: { value: utf8Encode("value11") },
		section1key2: { value: utf8Encode("value12") },
		section1key3: { value: utf8Encode("value13") },
		section2key1: { value: utf8Encode("value21") },
	},
	options: { prefix: "section1", limit: 2 },
	pages: [
		[{ name: "section1key1" }, { name: "section1key2" }],
		[{ name: "section1key3" }],
	],
});
test("list: paginates with variable limit", async (t) => {
	const { storage, gateway } = t.context;
	await storage.put("key1", { value: utf8Encode("value1") });
	await storage.put("key2", { value: utf8Encode("value2") });
	await storage.put("key3", { value: utf8Encode("value3") });

	// Get first page
	let page = await gateway.list({ limit: 1 });
	t.deepEqual(page.keys, [
		{ name: "key1", expiration: undefined, metadata: undefined },
	]);
	t.false(page.list_complete);
	t.not(page.cursor, undefined);

	// Get second page with different limit
	page = await gateway.list({ limit: 2, cursor: page.cursor });
	t.deepEqual(page.keys, [
		{ name: "key2", expiration: undefined, metadata: undefined },
		{ name: "key3", expiration: undefined, metadata: undefined },
	]);
	t.true(page.list_complete);
	t.is(page.cursor, undefined);
});
test("list: returns keys inserted whilst paginating", async (t) => {
	const { storage, gateway } = t.context;
	await storage.put("key1", { value: utf8Encode("value1") });
	await storage.put("key3", { value: utf8Encode("value3") });
	await storage.put("key5", { value: utf8Encode("value5") });

	// Get first page
	let page = await gateway.list({ limit: 2 });
	t.deepEqual(page.keys, [
		{ name: "key1", expiration: undefined, metadata: undefined },
		{ name: "key3", expiration: undefined, metadata: undefined },
	]);
	t.false(page.list_complete);
	t.not(page.cursor, undefined);

	// Insert key2 and key4
	await storage.put("key2", { value: utf8Encode("value2") });
	await storage.put("key4", { value: utf8Encode("value4") });

	// Get second page, expecting to see key4 but not key2
	page = await gateway.list({ limit: 2, cursor: page.cursor });
	t.deepEqual(page.keys, [
		{ name: "key4", expiration: undefined, metadata: undefined },
		{ name: "key5", expiration: undefined, metadata: undefined },
	]);
	t.true(page.list_complete);
	t.is(page.cursor, undefined);
});
test("list: ignores expired keys", async (t) => {
	const { storage, gateway } = t.context;
	for (let i = 1; i <= 3; i++) {
		await storage.put(`key${i}`, {
			value: utf8Encode(`value${i}`),
			expiration: i * 100,
		});
	}
	t.deepEqual(await gateway.list(), {
		keys: [],
		list_complete: true,
		cursor: undefined,
	});
});
test("list: sorts lexicographically", async (t) => {
	const { storage, gateway } = t.context;
	await storage.put(", ", { value: utf8Encode("value") });
	await storage.put("!", { value: utf8Encode("value") });
	t.deepEqual(await gateway.list(), {
		keys: [
			{ name: "!", expiration: undefined, metadata: undefined },
			{ name: ", ", expiration: undefined, metadata: undefined },
		],
		list_complete: true,
		cursor: undefined,
	});
});
test("list: validates limit", async (t) => {
	const { gateway } = t.context;
	await t.throwsAsync(gateway.list({ limit: "nan" as any }), {
		instanceOf: KVError,
		code: 400,
		message:
			"Invalid key_count_limit of nan. Please specify an integer greater than 0.",
	});
	await t.throwsAsync(gateway.list({ limit: 0 }), {
		instanceOf: KVError,
		code: 400,
		message:
			"Invalid key_count_limit of 0. Please specify an integer greater than 0.",
	});
	await t.throwsAsync(gateway.list({ limit: 1001 }), {
		instanceOf: KVError,
		code: 400,
		message:
			"Invalid key_count_limit of 1001. Please specify an integer less than 1000.",
	});
});
