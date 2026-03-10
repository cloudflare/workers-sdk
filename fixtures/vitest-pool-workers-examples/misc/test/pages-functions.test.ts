import {
	createPagesEventContext,
	env,
	ProvidedEnv,
	waitOnExecutionContext,
} from "cloudflare:test";
import { it, onTestFinished } from "vitest";

// This will improve in the next major version of `@cloudflare/workers-types`,
// but for now you'll need to do something like this to get a correctly-typed
// `Request` to pass to `createPagesEventContext()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

type BareFunction = PagesFunction<ProvidedEnv, never, Record<string, never>>;

it("can consume body in middleware and in next request", async ({ expect }) => {
	const fn: BareFunction = async (ctx) => {
		const requestText = await ctx.request.text();
		const nextResponse = await ctx.next();
		const nextResponseText = await nextResponse.text();
		return Response.json({ requestText, nextResponseText });
	};
	const request = new IncomingRequest("https://example.com", {
		method: "POST",
		body: "body",
	});
	const ctx = createPagesEventContext<typeof fn>({
		request,
		async next(nextRequest) {
			const nextRequestText = await nextRequest.text();
			return new Response(nextRequestText);
		},
	});
	const response = await fn(ctx);
	await waitOnExecutionContext(ctx);
	expect(await response.json()).toStrictEqual({
		requestText: "body",
		nextResponseText: "body",
	});
});

it("can rewrite to absolute and relative urls in next", async ({ expect }) => {
	const fn: BareFunction = async (ctx) => {
		const { pathname } = new URL(ctx.request.url);
		if (pathname === "/absolute") {
			return ctx.next("https://example.com/new-absolute", { method: "PUT" });
		} else if (pathname === "/relative/") {
			return ctx.next("./new", { method: "PATCH" });
		} else {
			return new Response(null, { status: 404 });
		}
	};

	// Check with absolute rewrite
	let request = new IncomingRequest("https://example.com/absolute");
	let ctx = createPagesEventContext<typeof fn>({
		request,
		async next(nextRequest) {
			return new Response(`next:${nextRequest.method} ${nextRequest.url}`);
		},
	});
	let response = await fn(ctx);
	await waitOnExecutionContext(ctx);
	expect(await response.text()).toBe(
		"next:PUT https://example.com/new-absolute"
	);

	// Check with relative rewrite
	request = new IncomingRequest("https://example.com/relative/");
	ctx = createPagesEventContext<typeof fn>({
		request,
		async next(nextRequest) {
			return new Response(`next:${nextRequest.method} ${nextRequest.url}`);
		},
	});
	response = await fn(ctx);
	await waitOnExecutionContext(ctx);
	expect(await response.text()).toBe(
		"next:PATCH https://example.com/relative/new"
	);
});

it("requires next property to call next()", async ({ expect }) => {
	const fn: BareFunction = (ctx) => ctx.next();
	const request = new IncomingRequest("https://example.com");
	const ctx = createPagesEventContext<typeof fn>({ request });
	await expect(fn(ctx)).rejects.toThrowErrorMatchingInlineSnapshot(
		`[TypeError: Cannot call \`EventContext#next()\` without including \`next\` property in 2nd argument to \`createPagesEventContext()\`]`
	);
});

it("requires ASSETS service binding", async ({ expect }) => {
	let originalASSETS = env.ASSETS;
	onTestFinished(() => {
		env.ASSETS = originalASSETS;
	});
	delete (env as Partial<ProvidedEnv>).ASSETS;

	const request = new IncomingRequest("https://example.com", {
		method: "POST",
		body: "body",
	});
	expect(() =>
		createPagesEventContext<BareFunction>({ request })
	).toThrowErrorMatchingInlineSnapshot(
		`[TypeError: Cannot call \`createPagesEventContext()\` without defining \`ASSETS\` service binding]`
	);
});

it("waits for waitUntil()ed promises", async ({ expect }) => {
	const fn: BareFunction = (ctx) => {
		ctx.waitUntil(ctx.env.KV_NAMESPACE.put("key", "value"));
		return new Response();
	};
	const request = new IncomingRequest("https://example.com");
	const ctx = createPagesEventContext<typeof fn>({ request });
	await fn(ctx);
	await waitOnExecutionContext(ctx);
	expect(await env.KV_NAMESPACE.get("key")).toBe("value");
});

it("correctly types parameters", async ({ expect }) => {
	const request = new IncomingRequest("https://example.com");

	// Check no params and no data required
	{
		type Fn = PagesFunction<ProvidedEnv, never, Record<string, never>>;
		createPagesEventContext<Fn>({ request });
		createPagesEventContext<Fn>({ request, params: {} });
		// @ts-expect-error no params required
		createPagesEventContext<Fn>({ request, params: { a: "1" } });
		createPagesEventContext<Fn>({ request, data: {} });
		// @ts-expect-error no data required
		createPagesEventContext<Fn>({ request, data: { b: "1" } });
	}

	// Check no params but data required
	{
		type Fn = PagesFunction<ProvidedEnv, never, { b: string }>;
		// @ts-expect-error data required
		createPagesEventContext<Fn>({ request });
		// @ts-expect-error data required
		createPagesEventContext<Fn>({ request, params: {} });
		// @ts-expect-error no params but data required
		createPagesEventContext<Fn>({ request, params: { a: "1" } });
		// @ts-expect-error data required
		createPagesEventContext<Fn>({ request, data: {} });
		createPagesEventContext<Fn>({ request, data: { b: "1" } });
	}

	// Check no data but params required
	{
		type Fn = PagesFunction<ProvidedEnv, "a", Record<string, never>>;
		// @ts-expect-error params required
		createPagesEventContext<Fn>({ request });
		// @ts-expect-error params required
		createPagesEventContext<Fn>({ request, params: {} });
		createPagesEventContext<Fn>({ request, params: { a: ["1"] } });
		// @ts-expect-error no data but params required
		createPagesEventContext<Fn>({ request, data: {} });
		// @ts-expect-error no data but params required
		createPagesEventContext<Fn>({ request, data: { b: "1" } });
	}

	// Check params and data required
	{
		type Fn = PagesFunction<ProvidedEnv, "a", { b: string }>;
		// @ts-expect-error params required
		createPagesEventContext<Fn>({ request });
		// @ts-expect-error params required
		createPagesEventContext<Fn>({ request, params: {} });
		// @ts-expect-error data required
		createPagesEventContext<Fn>({ request, params: { a: "1" } });
		// @ts-expect-error params required
		createPagesEventContext<Fn>({ request, data: {} });
		// @ts-expect-error params required
		createPagesEventContext<Fn>({ request, data: { b: "1" } });
		createPagesEventContext<Fn>({
			request,
			params: { a: "1" },
			data: { b: "1" },
		});
	}
});
