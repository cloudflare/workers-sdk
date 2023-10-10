import assert from "node:assert";
import getPort from "get-port";
import { Miniflare } from "miniflare";
import * as undici from "undici";
import { unstable_DevEnv as DevEnv } from "wrangler";

const fakeBundle = {};

let devEnv, mf, ws;

try {
	devEnv = new DevEnv();

	console.log(1);
	const run = await fakeStartUserWorker({
		script: `
        export default {
          fetch() {
            return new Response("body:1");
          }
        }
        `,
	});
	console.log(2);

	res = await run.worker.fetch("http://dummy");
} finally {
	await devEnv?.teardown();
	await mf?.dispose();
	await ws?.close();
}

async function fakeStartUserWorker(options) {
	const config = {
		...options.config,
		name: options.name ?? "test-worker",
		script: { contents: options.script },
	};
	const mfOpts = Object.assign(
		{
			port: 0,
			inspectorPort: 0,
			modules: true,
			compatibilityDate: "2023-08-01",
			name: config.name,
			script: options.script,
		},
		options.mfOpts
	);

	assert("script" in mfOpts);

	const worker = devEnv.startWorker(config);

	fakeConfigUpdate(config);
	fakeReloadStart(config);

	mf = new Miniflare(mfOpts);

	const userWorkerUrl = await mf.ready;
	const userWorkerInspectorUrl = await mf.getInspectorURL();
	fakeReloadComplete(config, mfOpts, userWorkerUrl, userWorkerInspectorUrl);

	return { worker, mf, mfOpts, config, userWorkerUrl, userWorkerInspectorUrl };
}

async function fakeUserWorkerChanges({ script, mfOpts, config }) {
	assert(mf);
	assert("script" in mfOpts);

	config = {
		...config,
		script: {
			...config.script,
			...(script ? { contents: script } : undefined),
		},
	};
	mfOpts = {
		...mfOpts,
		script: script ?? mfOpts.script,
	};

	fakeReloadStart(config);

	await mf.setOptions(mfOpts);

	const userWorkerUrl = await mf.ready;
	const userWorkerInspectorUrl = await mf.getInspectorURL();
	fakeReloadComplete(
		config,
		mfOpts,
		userWorkerUrl,
		userWorkerInspectorUrl,
		1000
	);

	return { mfOpts, config, mf, userWorkerUrl, userWorkerInspectorUrl };
}

function fireAndForgetFakeUserWorkerChanges(...args) {
	// fire and forget the reload -- this let's us test request buffering
	void fakeUserWorkerChanges(...args);
}

function fakeConfigUpdate(config) {
	devEnv.proxy.onConfigUpdate({
		type: "configUpdate",
		config,
	});

	return config; // convenience to allow calling and defining new config inline but also store the new object
}
function fakeReloadStart(config) {
	devEnv.proxy.onReloadStart({
		type: "reloadStart",
		config,
		bundle: fakeBundle,
	});

	return config;
}
function fakeReloadComplete(
	config,
	mfOpts,
	userWorkerUrl,
	userWorkerInspectorUrl,
	delay = 100
) {
	const proxyData = {
		userWorkerUrl: {
			protocol: userWorkerUrl.protocol,
			hostname: userWorkerUrl.host,
			port: userWorkerUrl.port,
		},
		userWorkerInspectorUrl: {
			protocol: userWorkerInspectorUrl.protocol,
			hostname: userWorkerInspectorUrl.hostname,
			port: userWorkerInspectorUrl.port,
			pathname: `/core:user:${config.name}`,
		},
		headers: {},
		liveReload: config.dev?.liveReload,
	};

	setTimeout(() => {
		devEnv.proxy.onReloadComplete({
			type: "reloadComplete",
			config,
			bundle: fakeBundle,
			proxyData,
		});
	}, delay);

	return { config, mfOpts }; // convenience to allow calling and defining new config/mfOpts inline but also store the new objects
}
