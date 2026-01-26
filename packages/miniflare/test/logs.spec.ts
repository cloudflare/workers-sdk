import { Miniflare, MiniflareCoreError, WorkerdStructuredLog } from "miniflare";
import { expect, test } from "vitest";
import { useDispose } from "./test-shared";

test("logs are treated as standard stdout/stderr chunks by default", async () => {
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
	useDispose(mf);

	const response = await mf.dispatchFetch("http://localhost");
	await response.text();

	expect(collected.stdout).toBe("__LOG__\n__INFO__\n__DEBUG__\n");
	expect(collected.stderr).toBe("__WARN__\n__ERROR__\n");
});

test("logs are structured and all sent to stdout when `structuredWorkerdLogs` is `true`", async () => {
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
	useDispose(mf);

	const response = await mf.dispatchFetch("http://localhost");
	await response.text();

	expect(collected.stdout).toMatch(
		/{"timestamp":\d+,"level":"log","message":"__LOG__"}/
	);
	expect(collected.stdout).toMatch(
		/{"timestamp":\d+,"level":"warn","message":"__WARN__"}/
	);
	expect(collected.stdout).toMatch(
		/{"timestamp":\d+,"level":"error","message":"__ERROR__"}/
	);
	expect(collected.stdout).toMatch(
		/{"timestamp":\d+,"level":"info","message":"__INFO__"}/
	);
	expect(collected.stdout).toMatch(
		/{"timestamp":\d+,"level":"debug","message":"__DEBUG__"}/
	);

	expect(collected.stderr).toBe("");
});

test("logs are structured and handled via `handleStructuredLogs` when such option is provided (no `structuredWorkerdLogs: true` needed)", async () => {
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
	useDispose(mf);

	const response = await mf.dispatchFetch("http://localhost");
	await response.text();

	expect(collectedLogs).toEqual([
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

test("even when `handleStructuredLogs` is provided, `handleRuntimeStdio` can still be used to read the raw stream values", async () => {
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
	useDispose(mf);

	const response = await mf.dispatchFetch("http://localhost");
	await response.text();

	expect(numOfCollectedStructuredLogs).toBe(2);

	expect(collectedRaw.stdout).toMatch(
		/{"timestamp":\d+,"level":"log","message":"__LOG__"}/
	);
	expect(collectedRaw.stdout).toMatch(
		/{"timestamp":\d+,"level":"error","message":"__ERROR__"}/
	);
	expect(collectedRaw.stderr).toBe("");
});

test("setting `handleStructuredLogs` when `structuredWorkerdLogs` is `false` triggers an error", async () => {
	const mf = new Miniflare({ modules: true, script: "" });
	useDispose(mf);

	let error: MiniflareCoreError | undefined = undefined;
	try {
		new Miniflare({
			modules: true,
			script: "",
			structuredWorkerdLogs: false,
			handleStructuredLogs() {},
		});
	} catch (e) {
		error = e as MiniflareCoreError;
	}

	expect(error).toBeInstanceOf(MiniflareCoreError);
	expect(error?.code).toBe("ERR_VALIDATION");
	expect(error?.message).toContain(
		"A `handleStructuredLogs` has been provided but `structuredWorkerdLogs` is set to `false`"
	);
});

test("when using `handleStructuredLogs` some known unhelpful logs are filtered out (e.g. CODE_MOVED warnings)", async () => {
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
	useDispose(mf);

	const response = await mf.dispatchFetch("http://localhost");
	await response.text();

	expect(collectedLogs).toEqual([
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
