import assert from "node:assert/strict";
import { cloudflareTest } from "@cloudflare/vitest-plugin";

const gate = Promise.withResolvers();
const admitted = Promise.withResolvers();
const stopped = Promise.withResolvers();
let workerCreated = false;
let workAdmitted = false;
let stopPromise;
const stopErrors = [];
let joined = false;
let completed = false;
let completedBeforeStop = false;

async function control(request) {
	const url = new URL(request.url);
	if (url.pathname === "/gate") {
		workAdmitted = true;
		admitted.resolve();
		await gate.promise;
	} else if (url.pathname === "/ready") {
		await admitted.promise;
	} else if (url.pathname === "/release") {
		assert.equal(url.searchParams.get("registered"), "true");
		assert.equal(joined, false);
		joined = true;
		gate.resolve();
	} else if (url.pathname === "/complete") {
		assert.equal(await request.text(), "registered-worker-import-complete");
		completed = true;
	} else {
		throw new Error(`Unexpected control request: ${url.pathname}`);
	}
	return new Response("ok");
}

export default {
	plugins: [
		cloudflareTest({
			main: "./worker.js",
			miniflare: {
				compatibilityDate: "2025-12-02",
				compatibilityFlags: ["nodejs_compat"],
				serviceBindings: { CONTROL: control },
			},
		}),
		{
			name: "observe-registered-work-shutdown",
			enforce: "post",
			configureVitest({ project }) {
				const actual = project.config.poolRunner;
				assert.equal(actual.name, "cloudflare-pool");
				project.config.poolRunner = {
					name: actual.name,
					createPoolWorker(options) {
						assert.equal(workerCreated, false);
						const worker = actual.createPoolWorker(options);
						workerCreated = true;
						return {
							name: worker.name,
							reportMemory: worker.reportMemory,
							cacheFs: worker.cacheFs,
							start: () => worker.start(),
							send: (message) => worker.send(message),
							deserialize: (message) => worker.deserialize(message),
							canReuse: worker.canReuse?.bind(worker),
							on: (event, callback) => worker.on(event, callback),
							off: (event, callback) => worker.off(event, callback),
							stop() {
								return (stopPromise ??= (async () => {
									completedBeforeStop = completed;
									try {
										// Release fixture work on failure too; actual stop still owns
										// disposing its Worker and requests awaiting module loading.
										gate.resolve();
										await worker.stop();
									} catch (error) {
										stopErrors.push(error);
										throw error;
									} finally {
										stopped.resolve();
									}
								})());
							},
						};
					},
				};
			},
		},
	],
	test: {
		retry: 0,
		reporters: [
			"default",
			{
				async onTestRunEnd(_modules, _errors, reason) {
					let timer;
					try {
						// Setup can fail before a worker exists. Vitest already reports that
						// error; there is no stop callback to wait for in that case.
						if (!workerCreated) {
							assert.notEqual(
								reason,
								"passed",
								"The fixture did not create a Worker"
							);
							return;
						}
						await Promise.race([
							stopped.promise,
							new Promise((_, reject) => {
								timer = setTimeout(
									() =>
										reject(
											new Error(
												"Registered-work fixture did not finish stopping within 5s"
											)
										),
									5_000
								);
							}),
						]);
						if (stopErrors.length > 0) {
							throw new AggregateError(
								stopErrors,
								"Registered-work fixture failed to stop"
							);
						}
						if (!workAdmitted) {
							assert.notEqual(
								reason,
								"passed",
								"The fixture did not register background work"
							);
							return;
						}
						assert.equal(
							completedBeforeStop,
							true,
							"REGISTERED_WAIT_UNTIL_IMPORT_MUST_COMPLETE_BEFORE_POOL_STOP"
						);
						assert.equal(joined, true);
					} finally {
						clearTimeout(timer);
						gate.resolve();
					}
				},
			},
		],
	},
};
