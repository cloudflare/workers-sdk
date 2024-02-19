import assert from "node:assert";
import { GET, POST, RouteHandler, Router } from "miniflare:shared";
import { createTestHandler } from "../worker-test";

class TestRouter extends Router {
	@GET("/params/:foo/:bar")
	get: RouteHandler<{ foo: string; bar: string }> = (req, params, url) => {
		return Response.json({
			method: req.method,
			pathname: url.pathname,
			searchParams: Object.fromEntries(url.searchParams),
			params,
		});
	};

	@POST("/")
	echo: RouteHandler = async (req) => {
		const body = await req.text();
		return new Response(`body:${body}`);
	};

	@POST("/twice")
	echoTwice: RouteHandler = async (req) => {
		const body = await req.text();
		return new Response(`body:${body}:${body}`);
	};
}

async function test() {
	const router = new TestRouter();

	// Check routing with params and search params
	let res = await router.fetch(
		new Request("http://localhost/params/one/two?q=thing")
	);
	assert.strictEqual(res.status, 200);
	assert.deepStrictEqual(await res.json(), {
		method: "GET",
		pathname: "/params/one/two",
		searchParams: { q: "thing" },
		params: { foo: "one", bar: "two" },
	});

	// Check trailing slash allowed
	res = await router.fetch(new Request("http://localhost/params/a/b/"));
	assert.strictEqual(res.status, 200);
	assert.deepStrictEqual(await res.json(), {
		method: "GET",
		pathname: "/params/a/b/",
		searchParams: {},
		params: { foo: "a", bar: "b" },
	});

	// Check routing with body and `async` handler
	res = await router.fetch(
		new Request("http://localhost/", { method: "POST", body: "test" })
	);
	assert.strictEqual(res.status, 200);
	assert.strictEqual(await res.text(), "body:test");

	// Check routing with multiple handlers for same method
	res = await router.fetch(
		new Request("http://localhost/twice", { method: "POST", body: "test" })
	);
	assert.strictEqual(res.status, 200);
	assert.strictEqual(await res.text(), "body:test:test");

	// Check unknown route doesn't match
	res = await router.fetch(new Request("http://localhost/unknown"));
	assert.strictEqual(res.status, 404);

	// Check unknown method but known path doesn't match
	res = await router.fetch(new Request("http://localhost/", { method: "PUT" }));
	assert.strictEqual(res.status, 405);
}

export default createTestHandler(test);
