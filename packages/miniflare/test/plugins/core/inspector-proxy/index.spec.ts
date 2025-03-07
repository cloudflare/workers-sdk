import test from "ava";
import { fetch, Miniflare } from "miniflare";

const nullScript =
	'addEventListener("fetch", (event) => event.respondWith(new Response(null, { status: 404 })));';

test.serial(
	"InspectorProxy: /json/version should provide details about the inspector version",
	async (t) => {
		const mf = new Miniflare({
			inspectorPort: 9212,
			unsafeInspectorProxy: true,
			workers: [
				{
					script: nullScript,
					unsafeInspectorProxy: true,
				},
			],
		});
		t.teardown(() => mf.dispose());

		await mf.ready;

		const res = await fetch("http://localhost:9212/json/version");
		const versionDetails = (await res.json()) as Record<string, string>;

		t.regex(versionDetails["Browser"], /^miniflare\/v\d\.\d{8}\.\d+$/);
		t.regex(versionDetails["Protocol-Version"], /^\d+\.\d+$/);
	}
);

test.serial(
	"InspectorProxy: /json should provide a list of a single worker inspector",
	async (t) => {
		const mf = new Miniflare({
			inspectorPort: 9212,
			unsafeInspectorProxy: true,
			workers: [
				{
					script: nullScript,
					unsafeInspectorProxy: true,
				},
			],
		});
		t.teardown(() => mf.dispose());

		await mf.ready;

		const res = await fetch("http://localhost:9212/json");
		const inspectors = (await res.json()) as Record<string, string>[];

		t.is(inspectors.length, 1);

		t.is(inspectors[0]["description"], "workers");
		t.is(inspectors[0]["title"], "Cloudflare Worker");
		t.is(inspectors[0]["webSocketDebuggerUrl"], "ws://localhost:9212/");
	}
);

test.serial(
	"InspectorProxy: /json should provide a list of a multiple worker inspector",
	async (t) => {
		const mf = new Miniflare({
			inspectorPort: 9212,
			unsafeInspectorProxy: true,
			workers: [
				{
					script: nullScript,
					unsafeInspectorProxy: true,
				},
				{
					name: "extra-worker-a",
					script: nullScript,
					unsafeInspectorProxy: true,
				},
				{
					name: "extra-worker-b",
					script: nullScript,
					unsafeInspectorProxy: true,
				},
			],
		});
		t.teardown(() => mf.dispose());

		await mf.ready;

		const res = await fetch("http://localhost:9212/json");
		const inspectors = (await res.json()) as Record<string, string>[];

		t.is(inspectors.length, 3);

		t.is(inspectors[0]["description"], "workers");
		t.is(inspectors[0]["title"], "Cloudflare Worker");
		t.is(inspectors[0]["webSocketDebuggerUrl"], "ws://localhost:9212/");
		t.is(inspectors[1]["description"], "workers");
		t.is(inspectors[1]["title"], "Cloudflare Worker: extra-worker-a");
		t.is(
			inspectors[1]["webSocketDebuggerUrl"],
			"ws://localhost:9212/extra-worker-a"
		);
		t.is(inspectors[2]["description"], "workers");
		t.is(inspectors[2]["title"], "Cloudflare Worker: extra-worker-b");
		t.is(
			inspectors[2]["webSocketDebuggerUrl"],
			"ws://localhost:9212/extra-worker-b"
		);
	}
);

test.serial(
	"InspectorProxy: /json should provide a list of a multiple worker inspector with some filtered out",
	async (t) => {
		const mf = new Miniflare({
			inspectorPort: 9212,
			unsafeInspectorProxy: true,
			workers: [
				{
					script: nullScript,
					unsafeInspectorProxy: true,
				},
				{
					name: "extra-worker-a",
					script: nullScript,
				},
				{
					name: "extra-worker-b",
					script: nullScript,
					unsafeInspectorProxy: true,
				},
			],
		});
		t.teardown(() => mf.dispose());

		await mf.ready;

		const res = await fetch("http://localhost:9212/json");
		const inspectors = (await res.json()) as Record<string, string>[];

		t.is(inspectors.length, 2);

		t.is(inspectors[0]["description"], "workers");
		t.is(inspectors[0]["title"], "Cloudflare Worker");
		t.is(inspectors[0]["webSocketDebuggerUrl"], "ws://localhost:9212/");
		t.is(inspectors[1]["description"], "workers");
		t.is(inspectors[1]["title"], "Cloudflare Worker: extra-worker-b");
		t.is(
			inspectors[1]["webSocketDebuggerUrl"],
			"ws://localhost:9212/extra-worker-b"
		);
	}
);
