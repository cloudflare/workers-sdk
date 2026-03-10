import { Request } from "undici";
import { assert, describe, it } from "vitest";
import { parseRequestInput } from "../api/dev";

describe("parseRequestInput for fetch on unstable dev", () => {
	it("should allow no input to be passed in", ({ expect }) => {
		const [input, _] = parseRequestInput("0.0.0.0", 8080);

		expect(input).toMatchInlineSnapshot(`"http://0.0.0.0:8080/"`);
	});

	it("should allow string of pathname to be passed in", ({ expect }) => {
		const [input, _] = parseRequestInput("0.0.0.0", 8080, "/test");

		expect(input).toMatchInlineSnapshot(`"http://0.0.0.0:8080/test"`);
	});

	it("should allow string of pathname and querystring to be passed in", ({
		expect,
	}) => {
		const [input, _] = parseRequestInput("0.0.0.0", 8080, "/test?q=testparam");

		expect(input).toMatchInlineSnapshot(
			`"http://0.0.0.0:8080/test?q=testparam"`
		);
	});

	it("should allow full url to be passed in as string and stripped", ({
		expect,
	}) => {
		const [input, _] = parseRequestInput(
			"0.0.0.0",
			8080,
			"http://cloudflare.com/test?q=testparam"
		);

		expect(input).toMatchInlineSnapshot(
			`"http://0.0.0.0:8080/test?q=testparam"`
		);
	});

	it("should allow URL object without pathname to be passed in and stripped", ({
		expect,
	}) => {
		const [input, _] = parseRequestInput(
			"0.0.0.0",
			8080,
			new URL("http://cloudflare.com")
		);

		expect(input).toMatchInlineSnapshot(`"http://0.0.0.0:8080/"`);
	});

	it("should allow URL object with pathname to be passed in and stripped", ({
		expect,
	}) => {
		const [input, _] = parseRequestInput(
			"0.0.0.0",
			8080,
			new URL("http://cloudflare.com/test")
		);

		expect(input).toMatchInlineSnapshot(`"http://0.0.0.0:8080/test"`);
	});

	it("should allow URL object with pathname and querystring to be passed in and stripped", ({
		expect,
	}) => {
		const [input, _] = parseRequestInput(
			"0.0.0.0",
			8080,
			new URL("http://cloudflare.com/test?q=testparam")
		);

		expect(input).toMatchInlineSnapshot(
			`"http://0.0.0.0:8080/test?q=testparam"`
		);
	});

	it("should allow request object to be passed in", ({ expect }) => {
		const [input, init] = parseRequestInput(
			"0.0.0.0",
			8080,
			new Request("https://cloudflare.com/test?q=testparam", { method: "POST" })
		);

		expect(input).toMatchInlineSnapshot(
			`"http://0.0.0.0:8080/test?q=testparam"`
		);
		assert(init instanceof Request);
		expect(init.method).toBe("POST");
		expect(init.headers.get("MF-Original-URL")).toMatchInlineSnapshot(
			`"https://cloudflare.com/test?q=testparam"`
		);
	});

	it("should parse to give https url with localProtocol = https", ({
		expect,
	}) => {
		const [input, _] = parseRequestInput("0.0.0.0", 8080, "/test", {}, "https");

		expect(input).toMatchInlineSnapshot(`"https://0.0.0.0:8080/test"`);
	});

	it("should parse to give http url with localProtocol = http", ({
		expect,
	}) => {
		const [input, _] = parseRequestInput("0.0.0.0", 8080, "/test", {}, "http");

		expect(input).toMatchInlineSnapshot(`"http://0.0.0.0:8080/test"`);
	});

	it("should parse to give http url with localProtocol not set", ({
		expect,
	}) => {
		const [input, _] = parseRequestInput("0.0.0.0", 8080, "/test", {});

		expect(input).toMatchInlineSnapshot(`"http://0.0.0.0:8080/test"`);
	});
});
