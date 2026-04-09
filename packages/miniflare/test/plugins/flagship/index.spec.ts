import { Miniflare } from "miniflare";
import { test } from "vitest";
import { useDispose } from "../../test-shared";

test("flagship", async ({ expect }) => {
	const mf = new Miniflare({
		compatibilityDate: "2025-01-01",
		flagship: {
			FLAGS: {
				app_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			},
		},
		modules: true,
		script: `
			export default {
				async fetch(request, env, ctx) {
					const url = new URL(request.url);

					if (url.pathname === "/boolean") {
						const value = await env.FLAGS.getBooleanValue("my-flag", false);
						return Response.json({ value });
					}

					if (url.pathname === "/string") {
						const value = await env.FLAGS.getStringValue("variant", "control", {
							userId: "user-123",
						});
						return Response.json({ value });
					}

					if (url.pathname === "/number") {
						const value = await env.FLAGS.getNumberValue("rate-limit", 100);
						return Response.json({ value });
					}

					if (url.pathname === "/details") {
						const details = await env.FLAGS.getBooleanDetails("my-flag", true);
						return Response.json(details);
					}

					if (url.pathname === "/get") {
						const value = await env.FLAGS.get("any-flag", "fallback");
						return Response.json({ value });
					}

					if (url.pathname === "/object") {
						const value = await env.FLAGS.getObjectValue("config", { theme: "light", beta: false });
						return Response.json({ value });
					}

					if (url.pathname === "/string-details") {
						const details = await env.FLAGS.getStringDetails("variant", "control");
						return Response.json(details);
					}

					if (url.pathname === "/number-details") {
						const details = await env.FLAGS.getNumberDetails("rate-limit", 100);
						return Response.json(details);
					}

					if (url.pathname === "/object-details") {
						const details = await env.FLAGS.getObjectDetails("config", { theme: "light" });
						return Response.json(details);
					}

					return new Response("Not found", { status: 404 });
				},
			}
		`,
	});
	useDispose(mf);

	// Local stub returns the default value for all evaluations
	const boolRes = await mf.dispatchFetch("http://placeholder/boolean");
	expect(await boolRes.json()).toEqual({ value: false });

	const strRes = await mf.dispatchFetch("http://placeholder/string");
	expect(await strRes.json()).toEqual({ value: "control" });

	const numRes = await mf.dispatchFetch("http://placeholder/number");
	expect(await numRes.json()).toEqual({ value: 100 });

	const detailsRes = await mf.dispatchFetch("http://placeholder/details");
	expect(await detailsRes.json()).toEqual({
		flagKey: "my-flag",
		value: true,
		reason: "DEFAULT",
	});

	const getRes = await mf.dispatchFetch("http://placeholder/get");
	expect(await getRes.json()).toEqual({ value: "fallback" });

	const objRes = await mf.dispatchFetch("http://placeholder/object");
	expect(await objRes.json()).toEqual({
		value: { theme: "light", beta: false },
	});

	const strDetailsRes = await mf.dispatchFetch(
		"http://placeholder/string-details"
	);
	expect(await strDetailsRes.json()).toEqual({
		flagKey: "variant",
		value: "control",
		reason: "DEFAULT",
	});

	const numDetailsRes = await mf.dispatchFetch(
		"http://placeholder/number-details"
	);
	expect(await numDetailsRes.json()).toEqual({
		flagKey: "rate-limit",
		value: 100,
		reason: "DEFAULT",
	});

	const objDetailsRes = await mf.dispatchFetch(
		"http://placeholder/object-details"
	);
	expect(await objDetailsRes.json()).toEqual({
		flagKey: "config",
		value: { theme: "light" },
		reason: "DEFAULT",
	});
});

test("getObjectValue: returns default object value", async ({ expect }) => {
	const mf = new Miniflare({
		compatibilityDate: "2025-01-01",
		flagship: {
			FLAGS: {
				app_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			},
		},
		modules: true,
		script: `
			export default {
				async fetch(request, env) {
					const value = await env.FLAGS.getObjectValue("config", { theme: "dark", features: ["a", "b"] });
					return Response.json(value);
				},
			}
		`,
	});
	useDispose(mf);

	const res = await mf.dispatchFetch("http://placeholder/");
	expect(await res.json()).toEqual({ theme: "dark", features: ["a", "b"] });
});

test("getObjectValue: returns default with context parameter", async ({
	expect,
}) => {
	const mf = new Miniflare({
		compatibilityDate: "2025-01-01",
		flagship: {
			FLAGS: {
				app_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			},
		},
		modules: true,
		script: `
			export default {
				async fetch(request, env) {
					const value = await env.FLAGS.getObjectValue("config", { enabled: true }, { userId: "user-123" });
					return Response.json(value);
				},
			}
		`,
	});
	useDispose(mf);

	const res = await mf.dispatchFetch("http://placeholder/");
	expect(await res.json()).toEqual({ enabled: true });
});

test("getObjectDetails: returns evaluation details with default object", async ({
	expect,
}) => {
	const mf = new Miniflare({
		compatibilityDate: "2025-01-01",
		flagship: {
			FLAGS: {
				app_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			},
		},
		modules: true,
		script: `
			export default {
				async fetch(request, env) {
					const details = await env.FLAGS.getObjectDetails("app-config", { maxRetries: 3, timeout: 5000 });
					return Response.json(details);
				},
			}
		`,
	});
	useDispose(mf);

	const res = await mf.dispatchFetch("http://placeholder/");
	expect(await res.json()).toEqual({
		flagKey: "app-config",
		value: { maxRetries: 3, timeout: 5000 },
		reason: "DEFAULT",
	});
});

test("getObjectDetails: returns evaluation details with context parameter", async ({
	expect,
}) => {
	const mf = new Miniflare({
		compatibilityDate: "2025-01-01",
		flagship: {
			FLAGS: {
				app_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			},
		},
		modules: true,
		script: `
			export default {
				async fetch(request, env) {
					const details = await env.FLAGS.getObjectDetails("config", { color: "blue" }, { region: "us-east" });
					return Response.json(details);
				},
			}
		`,
	});
	useDispose(mf);

	const res = await mf.dispatchFetch("http://placeholder/");
	expect(await res.json()).toEqual({
		flagKey: "config",
		value: { color: "blue" },
		reason: "DEFAULT",
	});
});

test("getStringDetails: returns evaluation details with default string", async ({
	expect,
}) => {
	const mf = new Miniflare({
		compatibilityDate: "2025-01-01",
		flagship: {
			FLAGS: {
				app_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			},
		},
		modules: true,
		script: `
			export default {
				async fetch(request, env) {
					const details = await env.FLAGS.getStringDetails("color-scheme", "dark-mode");
					return Response.json(details);
				},
			}
		`,
	});
	useDispose(mf);

	const res = await mf.dispatchFetch("http://placeholder/");
	expect(await res.json()).toEqual({
		flagKey: "color-scheme",
		value: "dark-mode",
		reason: "DEFAULT",
	});
});

test("getStringDetails: returns evaluation details with context parameter", async ({
	expect,
}) => {
	const mf = new Miniflare({
		compatibilityDate: "2025-01-01",
		flagship: {
			FLAGS: {
				app_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			},
		},
		modules: true,
		script: `
			export default {
				async fetch(request, env) {
					const details = await env.FLAGS.getStringDetails("variant", "treatment-a", { userId: "user-456" });
					return Response.json(details);
				},
			}
		`,
	});
	useDispose(mf);

	const res = await mf.dispatchFetch("http://placeholder/");
	expect(await res.json()).toEqual({
		flagKey: "variant",
		value: "treatment-a",
		reason: "DEFAULT",
	});
});

test("getNumberDetails: returns evaluation details with default number", async ({
	expect,
}) => {
	const mf = new Miniflare({
		compatibilityDate: "2025-01-01",
		flagship: {
			FLAGS: {
				app_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			},
		},
		modules: true,
		script: `
			export default {
				async fetch(request, env) {
					const details = await env.FLAGS.getNumberDetails("max-connections", 50);
					return Response.json(details);
				},
			}
		`,
	});
	useDispose(mf);

	const res = await mf.dispatchFetch("http://placeholder/");
	expect(await res.json()).toEqual({
		flagKey: "max-connections",
		value: 50,
		reason: "DEFAULT",
	});
});

test("getNumberDetails: returns evaluation details with context parameter", async ({
	expect,
}) => {
	const mf = new Miniflare({
		compatibilityDate: "2025-01-01",
		flagship: {
			FLAGS: {
				app_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			},
		},
		modules: true,
		script: `
			export default {
				async fetch(request, env) {
					const details = await env.FLAGS.getNumberDetails("timeout-ms", 3000, { tier: "premium" });
					return Response.json(details);
				},
			}
		`,
	});
	useDispose(mf);

	const res = await mf.dispatchFetch("http://placeholder/");
	expect(await res.json()).toEqual({
		flagKey: "timeout-ms",
		value: 3000,
		reason: "DEFAULT",
	});
});
