import assert from "node:assert/strict";
const origin = "http://127.0.0.1:5178";
const call = (path, init = {}) =>
	fetch(new URL(path, origin), {
		redirect: "manual",
		signal: AbortSignal.timeout(10000),
		...init,
	});
const flow = await (await call("/start")).json();
assert.ok(flow.authorizationUrl);
const consent = await call(flow.authorizationUrl);
assert.equal(consent.status, 303);
const callback = consent.headers.get("location");
assert.equal(
	new URL(callback).origin,
	origin,
	"OAuth must return through Vite's public port"
);
const returned = await call(callback);
assert.equal(returned.status, 303);
const receipt = Object.fromEntries(
	new URLSearchParams(new URL(returned.headers.get("location")).hash.slice(1))
);
const completed = await call("/finish", {
	method: "POST",
	headers: { "content-type": "application/json" },
	body: JSON.stringify(receipt),
});
assert.equal(completed.status, 200);
try {
	const result = await (await call("/data")).json();
	assert.equal(result.status.state, "ready");
	assert.ok(Array.isArray(result.data.records));
} finally {
	assert.equal((await call("/disconnect", { method: "POST" })).status, 200);
}
console.log(
	"Vite app-owned consent, public callback, API dispatch and disconnect passed."
);
