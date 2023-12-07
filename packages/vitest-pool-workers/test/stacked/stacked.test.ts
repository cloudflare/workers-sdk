import { env } from "cloudflare:test";
import { describe, beforeAll, beforeEach, expect, test } from "vitest";

async function get() {
	return await env.TEST_NAMESPACE.get("thing");
}

async function append(str: string) {
	const value = (await get()) ?? "";
	await env.TEST_NAMESPACE.put("thing", value + str);
}

beforeAll(() => append("a"));
beforeEach(() => append("b"));

test("KV test 1", async () => {
	await append("c");
	expect(await get()).toBe("abc");
});
test("KV test 2", async () => {
	await append("d");
	expect(await get()).toBe("abd");
});

describe("more KV tests", () => {
	beforeAll(() => append("e"));
	beforeEach(() => append("f"));

	test("KV test 3", async () => {
		await append("g");
		expect(await get()).toBe("aebfg");
	});
	test("KV test 4", async () => {
		await append("h");
		expect(await get()).toBe("aebfh");
	});

	describe("even more KV tests", () => {
		beforeAll(() => append("i"));
		beforeEach(() => append("j"));

		test("KV test 5", async () => {
			await append("k");
			expect(await get()).toBe("aeibfjk");
		});
		test("KV test 6", async () => {
			await append("l");
			expect(await get()).toBe("aeibfjl");
		});
	});
});

test("KV test 7", async () => {
	await append("m");
	expect(await get()).toBe("abm");
});
test("KV test 8", async () => {
	await append("n");
	expect(await get()).toBe("abn");
});

test(
	"KV retry test",
	async () => {
		await append("o");
		expect(await get()).toBe("abo");
	},
	{ retry: 2, repeats: 2 }
);
