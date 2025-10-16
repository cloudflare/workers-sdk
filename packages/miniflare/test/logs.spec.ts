import test from "ava";
import { Miniflare, MiniflareCoreError, WorkerdStructuredLog } from "miniflare";

test("logs are treated as standard stdout/stderr chunks by default", async (t) => {
	const collected = {
		stdout: "",
		stderr: "",
	};
	const mf = new Miniflare({
		modules: true,
		handleRuntimeStdio(stdout, stderr) {
			stdout.forEach((data) => {
				collected.stdout += `${data}`;
			});
			stderr.forEach((error) => {
				collected.stderr += `${error}`;
			});
		},
		script: `
			export default {
				async fetch(req, env) {
				console.log('__LOG__');
				console.warn('__WARN__');
				console.error('__ERROR__');
				console.info('__INFO__');
				console.debug('__DEBUG__');
				return new Response('Hello world!');
			}
		}`,
	});
	t.teardown(() => mf.dispose());

	const response = await mf.dispatchFetch("http://localhost");
	await response.text();

	t.is(collected.stdout, "__LOG__\n__INFO__\n__DEBUG__\n");
	t.is(collected.stderr, "__WARN__\n__ERROR__\n");
});

test("logs are structured and all sent to stdout when `structuredWorkerdLogs` is `true`", async (t) => {
	const collected = {
		stdout: "",
		stderr: "",
	};
	const mf = new Miniflare({
		modules: true,
		structuredWorkerdLogs: true,
		handleRuntimeStdio(stdout, stderr) {
			stdout.forEach((data) => {
				collected.stdout += `${data}`;
			});
			stderr.forEach((error) => {
				collected.stderr += `${error}`;
			});
		},
		script: `
			export default {
				async fetch(req, env) {
				console.log('__LOG__');
				console.warn('__WARN__');
				console.error('__ERROR__');
				console.info('__INFO__');
				console.debug('__DEBUG__');
				return new Response('Hello world!');
			}
		}`,
	});
	t.teardown(() => mf.dispose());

	const response = await mf.dispatchFetch("http://localhost");
	await response.text();

	t.regex(
		collected.stdout,
		/{"timestamp":\d+,"level":"log","message":"__LOG__"}/
	);
	t.regex(
		collected.stdout,
		/{"timestamp":\d+,"level":"warn","message":"__WARN__"}/
	);
	t.regex(
		collected.stdout,
		/{"timestamp":\d+,"level":"error","message":"__ERROR__"}/
	);
	t.regex(
		collected.stdout,
		/{"timestamp":\d+,"level":"info","message":"__INFO__"}/
	);
	t.regex(
		collected.stdout,
		/{"timestamp":\d+,"level":"debug","message":"__DEBUG__"}/
	);

	t.is(collected.stderr, "");
});

test("logs are structured and handled via `handleStructuredLogs` when such option is provided (no `structuredWorkerdLogs: true` needed)", async (t) => {
	const collectedLogs: (Pick<WorkerdStructuredLog, "level" | "message"> & {
		timestamp: string;
	})[] = [];
	const mf = new Miniflare({
		modules: true,
		handleStructuredLogs(log) {
			collectedLogs.push({
				...log,
				timestamp: `<${typeof log.timestamp}>`,
			});
		},
		script: `
			export default {
				async fetch(req, env) {
				console.log('__LOG__');
				console.warn('__WARN__');
				console.error('__ERROR__');
				console.info('__INFO__');
				console.debug('__DEBUG__');
				return new Response('Hello world!');
			}
		}`,
	});
	t.teardown(() => mf.dispose());

	const response = await mf.dispatchFetch("http://localhost");
	await response.text();

	t.deepEqual(collectedLogs, [
		{
			level: "log",
			message: "__LOG__",
			timestamp: "<number>",
		},
		{
			level: "warn",
			message: "__WARN__",
			timestamp: "<number>",
		},
		{
			level: "error",
			message: "__ERROR__",
			timestamp: "<number>",
		},
		{
			level: "info",
			message: "__INFO__",
			timestamp: "<number>",
		},
		{
			level: "debug",
			message: "__DEBUG__",
			timestamp: "<number>",
		},
	]);
});

test("even when `handleStructuredLogs` is provided, `handleRuntimeStdio` can still be used to read the raw stream values", async (t) => {
	let numOfCollectedStructuredLogs = 0;
	const collectedRaw = {
		stdout: "",
		stderr: "",
	};
	const mf = new Miniflare({
		modules: true,
		handleRuntimeStdio(stdout, stderr) {
			stdout.forEach((data) => {
				collectedRaw.stdout += `${data}`;
			});
			stderr.forEach((error) => {
				collectedRaw.stderr += `${error}`;
			});
		},
		handleStructuredLogs() {
			numOfCollectedStructuredLogs++;
		},
		script: `
			export default {
				async fetch(req, env) {
				console.log('__LOG__');
				console.error('__ERROR__');
				return new Response('Hello world!');
			}
		}`,
	});
	t.teardown(() => mf.dispose());

	const response = await mf.dispatchFetch("http://localhost");
	await response.text();

	t.is(numOfCollectedStructuredLogs, 2);

	t.regex(
		collectedRaw.stdout,
		/{"timestamp":\d+,"level":"log","message":"__LOG__"}/
	);
	t.regex(
		collectedRaw.stdout,
		/{"timestamp":\d+,"level":"error","message":"__ERROR__"}/
	);
	t.is(collectedRaw.stderr, "");
});

test("setting `handleStructuredLogs` when `structuredWorkerdLogs` is `false` triggers an error", async (t) => {
	const mf = new Miniflare({ modules: true, script: "" });
	t.teardown(() => mf.dispose());

	t.throws(
		() =>
			new Miniflare({
				modules: true,
				script: "",
				structuredWorkerdLogs: false,
				handleStructuredLogs() {},
			}),
		{
			instanceOf: MiniflareCoreError,
			code: "ERR_VALIDATION",
			message(message) {
				return message.includes(
					"A `handleStructuredLogs` has been provided but `structuredWorkerdLogs` is set to `false`"
				);
			},
		}
	);
});

test("when using `handleStructuredLogs` some known unhelpful logs are filtered out (e.g. CODE_MOVED warnings)", async (t) => {
	const collectedLogs: (Pick<WorkerdStructuredLog, "level" | "message"> & {
		timestamp: string;
	})[] = [];
	const mf = new Miniflare({
		modules: true,
		handleStructuredLogs(log) {
			collectedLogs.push({
				...log,
				timestamp: `<${typeof log.timestamp}>`,
			});
		},
		script: `
			export default {
				async fetch(req, env) {
				console.log('__LOG__');
				console.error('CODE_MOVED for unknown code block');
				console.error('__ERROR__');
				return new Response('Hello world!');
			}
		}`,
	});
	t.teardown(() => mf.dispose());

	const response = await mf.dispatchFetch("http://localhost");
	await response.text();

	t.deepEqual(collectedLogs, [
		{
			level: "log",
			message: "__LOG__",
			timestamp: "<number>",
		},
		{
			level: "error",
			message: "__ERROR__",
			timestamp: "<number>",
		},
	]);
});
