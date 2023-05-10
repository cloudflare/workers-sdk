import assert from "assert";
import {
	GET,
	GatewayFactory,
	NoOpLog,
	POST,
	Request,
	Response,
	RouteHandler,
	Router,
	defaultTimers,
} from "@miniflare/tre";
import test from "ava";

class TestGateway {
	constructor() {}
}

class TestRouter extends Router<TestGateway> {
	constructor() {
		const log = new NoOpLog();
		super(
			log,
			new GatewayFactory(
				log,
				defaultTimers,
				() => assert.fail("dispatchFetch not implemented"),
				"test",
				TestGateway
			)
		);
	}

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

test("Router: routes requests", async (t) => {
	const router = new TestRouter();

	// Check routing with params and search params
	let res = await router.route(
		new Request("http://localhost/params/one/two?q=thing")
	);
	assert(res);
	t.is(res.status, 200);
	t.deepEqual(await res.json(), {
		method: "GET",
		pathname: "/params/one/two",
		searchParams: { q: "thing" },
		params: { foo: "one", bar: "two" },
	});

	// Check trailing slash allowed
	res = await router.route(new Request("http://localhost/params/a/b/"));
	assert(res);
	t.is(res.status, 200);
	t.like(await res.json(), { params: { foo: "a", bar: "b" } });

	// Check routing with body and `async` handler
	res = await router.route(
		new Request("http://localhost/", { method: "POST", body: "test" })
	);
	assert(res);
	t.is(res.status, 200);
	t.is(await res.text(), "body:test");

	// Check routing with multiple handlers for same method
	res = await router.route(
		new Request("http://localhost/twice", { method: "POST", body: "test" })
	);
	assert(res);
	t.is(res.status, 200);
	t.is(await res.text(), "body:test:test");

	// Check unknown route doesn't match
	res = await router.route(new Request("http://localhost/unknown"));
	t.is(res, undefined);

	// Check unknown method but known path doesn't match
	res = await router.route(new Request("http://localhost/", { method: "PUT" }));
	t.is(res, undefined);
});
