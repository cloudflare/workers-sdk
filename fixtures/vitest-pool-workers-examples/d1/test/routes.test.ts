import { env, SELF } from "cloudflare:test";
import { expect, it } from "vitest";
import { upsertPost } from "../src";

it("should create and read post", async () => {
	let response = await SELF.fetch("https://example.com/hello", {
		method: "PUT",
		body: "👋",
	});
	expect(response.status).toBe(204);

	response = await SELF.fetch("https://example.com/hello");
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("👋");
});

it("should list posts", async () => {
	await upsertPost(env, "/one", "1");
	await upsertPost(env, "/two", "2");
	await upsertPost(env, "/three", "3");

	const response = await SELF.fetch("https://example.com/");
	expect(response.status).toBe(200);
	expect(await response.text()).toMatchInlineSnapshot(`
		"https://example.com/one
		1

		--------------------
		https://example.com/two
		2

		--------------------
		https://example.com/three
		3"
	`);
});

it("should reject invalid method", async () => {
	const response = await SELF.fetch("https://example.com/hello", {
		method: "POST",
		body: "👋",
	});
	expect(response.status).toBe(405);
});

it("should respond with not found for invalid slugs", async () => {
	const response = await SELF.fetch("https://example.com/bad");
	expect(response.status).toBe(404);
});

it("shouldn't allow creating post at root", async () => {
	const response = await SELF.fetch("https://example.com/", {
		method: "PUT",
		body: "👋",
	});
	expect(response.status).toBe(405);
});
