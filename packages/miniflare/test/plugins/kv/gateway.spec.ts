import assert from "assert";
import { Blob } from "buffer";
import { text } from "stream/consumers";
import {
	KVError,
	KVGateway,
	KVGatewayListOptions,
	KVGatewayListResult,
	KeyValueStorage,
	MemoryStorage,
	NoOpLog,
} from "@miniflare/tre";
import anyTest, { Macro, TestFn, ThrowsExpectation } from "ava";
import {
	TIME_EXPIRED,
	TIME_EXPIRING,
	TIME_NOW,
	createJunkStream,
	testClock,
} from "../../test-shared";

interface Context {
	storage: KeyValueStorage;
	gateway: KVGateway;
}

const test = anyTest as TestFn<Context>;

test.beforeEach((t) => {
	// TODO(soon): clean up this mess once we've migrated all gateways
	const legacyStorage = new MemoryStorage(undefined, testClock);
	const newStorage = legacyStorage.getNewStorage();
	const gateway = new KVGateway(new NoOpLog(), legacyStorage, testClock);
	const kvStorage = new KeyValueStorage(newStorage, testClock);
	t.context = { storage: kvStorage, gateway };
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
	await storage.put({
		key: "key",
		value: new Blob(["value"]).stream(),
		metadata: { testing: true },
	});
	const result = await gateway.get("key");
	assert(result !== undefined);
	t.is(await text(result.value), "value");
	t.deepEqual(result, {
		value: result.value,
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
	await storage.put({
		key: "key",
		value: new Blob(["value"]).stream(),
		expiration: TIME_EXPIRED,
	});
	t.is(await gateway.get("key"), undefined);
});
test("get: validates but ignores cache ttl", async (t) => {
	const { storage, gateway } = t.context;
	await storage.put({
		key: "key",
		value: new Blob(["value"]).stream(),
	});
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
	await gateway.put(key, new Blob(["value"]).stream());
});
test("put: puts value", async (t) => {
	const { storage, gateway } = t.context;
	await gateway.put("key", new Blob(["value"]).stream(), {
		expiration: TIME_EXPIRING,
		metadata: { testing: true },
	});
	const result = await storage.get("key");
	assert(result !== null);
	t.deepEqual(result, {
		key: "key",
		value: result.value,
		expiration: TIME_EXPIRING * 1000,
		metadata: { testing: true },
	});
	t.is(await text(result.value), "value");
});
test("put: overrides existing keys", async (t) => {
	const { storage, gateway } = t.context;
	await gateway.put("key", new Blob(["value1"]).stream());
	await gateway.put("key", new Blob(["value2"]).stream(), {
		expiration: TIME_EXPIRING,
		metadata: { testing: true },
	});
	const result = await storage.get("key");
	assert(result !== null);
	t.deepEqual(result, {
		key: "key",
		value: result.value,
		expiration: TIME_EXPIRING * 1000,
		metadata: { testing: true },
	});
	t.is(await text(result.value), "value2");
});
test("put: keys are case-sensitive", async (t) => {
	const { gateway } = t.context;
	await gateway.put("key", new Blob(["lower"]).stream());
	await gateway.put("KEY", new Blob(["upper"]).stream());
	let result = await gateway.get("key");
	assert(result !== undefined);
	t.is(await text(result.value), "lower");
	result = await gateway.get("KEY");
	assert(result !== undefined);
	t.is(await text(result.value), "upper");
});
test("put: validates expiration ttl", async (t) => {
	const { gateway } = t.context;
	const blob = new Blob(["value1"]);
	const value = () => blob.stream();
	await t.throwsAsync(gateway.put("key", value(), { expirationTtl: "nan" }), {
		instanceOf: KVError,
		code: 400,
		message:
			"Invalid expiration_ttl of nan. Please specify integer greater than 0.",
	});
	await t.throwsAsync(gateway.put("key", value(), { expirationTtl: 0 }), {
		instanceOf: KVError,
		code: 400,
		message:
			"Invalid expiration_ttl of 0. Please specify integer greater than 0.",
	});
	await t.throwsAsync(gateway.put("key", value(), { expirationTtl: 30 }), {
		instanceOf: KVError,
		code: 400,
		message:
			"Invalid expiration_ttl of 30. Expiration TTL must be at least 60.",
	});
});
test("put: validates expiration", async (t) => {
	const { gateway } = t.context;
	const blob = new Blob(["value"]);
	const value = () => blob.stream();
	await t.throwsAsync(gateway.put("key", value(), { expiration: "nan" }), {
		instanceOf: KVError,
		code: 400,
		message:
			"Invalid expiration of nan. Please specify integer greater than the current number of seconds since the UNIX epoch.",
	});
	await t.throwsAsync(gateway.put("key", value(), { expiration: TIME_NOW }), {
		instanceOf: KVError,
		code: 400,
		message: `Invalid expiration of ${TIME_NOW}. Please specify integer greater than the current number of seconds since the UNIX epoch.`,
	});
	await t.throwsAsync(
		gateway.put("key", value(), { expiration: TIME_NOW + 30 }),
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
	const expectations: ThrowsExpectation<KVError> = {
		instanceOf: KVError,
		code: 413,
		message: `Value length of ${byteLength} exceeds limit of ${maxValueSize}.`,
	};
	// Check with and without `valueLengthHint`
	await t.throwsAsync(
		gateway.put("key", createJunkStream(byteLength), {
			valueLengthHint: byteLength,
		}),
		expectations
	);
	await t.throwsAsync(
		gateway.put("key", createJunkStream(byteLength)),
		expectations
	);
	// Check 1 less byte is accepted
	await gateway.put("key", createJunkStream(byteLength - 1));
});
test("put: validates metadata size", async (t) => {
	const { gateway } = t.context;
	const maxMetadataSize = 1024;
	await t.throwsAsync(
		gateway.put("key", new Blob(["value"]).stream(), {
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
	await storage.put({
		key: "key",
		value: new Blob(["value"]).stream(),
	});
	t.not(await storage.get("key"), null);
	await gateway.delete("key");
	t.is(await storage.get("key"), null);
});
test("delete: does nothing for non-existent keys", async (t) => {
	const { gateway } = t.context;
	await gateway.delete("key");
	t.pass();
});

const listMacro: Macro<
	[
		{
			values: Record<
				string,
				{ value: string; expiration?: number; metadata?: unknown }
			>;
			options?: KVGatewayListOptions;
			pages: KVGatewayListResult["keys"][];
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
			await storage.put({
				key,
				value: new Blob([value.value]).stream(),
				expiration:
					value.expiration === undefined ? undefined : value.expiration * 1000,
				metadata: value.metadata,
			});
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
		key3: { value: "value3" },
		key1: { value: "value1" },
		key2: { value: "value2" },
	},
	pages: [[{ name: "key1" }, { name: "key2" }, { name: "key3" }]],
});
test("lists keys matching prefix", listMacro, {
	values: {
		section1key1: { value: "value11" },
		section1key2: { value: "value12" },
		section2key1: { value: "value21" },
	},
	options: { prefix: "section1" },
	pages: [[{ name: "section1key1" }, { name: "section1key2" }]],
});
test("prefix is case-sensitive", listMacro, {
	values: {
		key1: { value: "lower1" },
		key2: { value: "lower2 " },
		KEY1: { value: "upper1" },
		KEY2: { value: "upper2" },
	},
	options: { prefix: "KEY" },
	pages: [[{ name: "KEY1" }, { name: "KEY2" }]],
});
test("prefix permits special characters", listMacro, {
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
test("lists keys with expiration", listMacro, {
	values: {
		key1: { value: "value1", expiration: TIME_EXPIRING },
		key2: { value: "value2", expiration: TIME_EXPIRING + 100 },
		key3: { value: "value3", expiration: TIME_EXPIRING + 200 },
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
		key1: { value: "value1", metadata: { testing: 1 } },
		key2: { value: "value2", metadata: { testing: 2 } },
		key3: { value: "value3", metadata: { testing: 3 } },
	},
	pages: [
		[
			{ name: "key1", metadata: '{"testing":1}' },
			{ name: "key2", metadata: '{"testing":2}' },
			{ name: "key3", metadata: '{"testing":3}' },
		],
	],
});
test("lists keys with expiration and metadata", listMacro, {
	values: {
		key1: {
			value: "value1",
			expiration: TIME_EXPIRING,
			metadata: { testing: 1 },
		},
		key2: {
			value: "value2",
			expiration: TIME_EXPIRING + 100,
			metadata: { testing: 2 },
		},
		key3: {
			value: "value3",
			expiration: TIME_EXPIRING + 200,
			metadata: { testing: 3 },
		},
	},
	pages: [
		[
			{
				name: "key1",
				expiration: TIME_EXPIRING,
				metadata: '{"testing":1}',
			},
			{
				name: "key2",
				expiration: TIME_EXPIRING + 100,
				metadata: '{"testing":2}',
			},
			{
				name: "key3",
				expiration: TIME_EXPIRING + 200,
				metadata: '{"testing":3}',
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
		key1: { value: "value1" },
		key2: { value: "value2" },
		key3: { value: "value3" },
	},
	options: { prefix: "none" },
	pages: [[]],
});
test("paginates keys", listMacro, {
	values: {
		key1: { value: "value1" },
		key2: { value: "value2" },
		key3: { value: "value3" },
	},
	options: { limit: 2 },
	pages: [[{ name: "key1" }, { name: "key2" }], [{ name: "key3" }]],
});
test("paginates keys matching prefix", listMacro, {
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
test("list: paginates with variable limit", async (t) => {
	const { storage, gateway } = t.context;
	await storage.put({ key: "key1", value: new Blob(["value1"]).stream() });
	await storage.put({ key: "key2", value: new Blob(["value2"]).stream() });
	await storage.put({ key: "key3", value: new Blob(["value3"]).stream() });

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
	await storage.put({ key: "key1", value: new Blob(["value1"]).stream() });
	await storage.put({ key: "key3", value: new Blob(["value3"]).stream() });
	await storage.put({ key: "key5", value: new Blob(["value5"]).stream() });

	// Get first page
	let page = await gateway.list({ limit: 2 });
	t.deepEqual(page.keys, [
		{ name: "key1", expiration: undefined, metadata: undefined },
		{ name: "key3", expiration: undefined, metadata: undefined },
	]);
	t.false(page.list_complete);
	t.not(page.cursor, undefined);

	// Insert key2 and key4
	await storage.put({ key: "key2", value: new Blob(["value2"]).stream() });
	await storage.put({ key: "key4", value: new Blob(["value4"]).stream() });

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
		await storage.put({
			key: `key${i}`,
			value: new Blob([`value${i}`]).stream(),
			expiration: i * 100 * 1000,
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
	await storage.put({ key: ", ", value: new Blob(["value"]).stream() });
	await storage.put({ key: "!", value: new Blob(["value"]).stream() });
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
