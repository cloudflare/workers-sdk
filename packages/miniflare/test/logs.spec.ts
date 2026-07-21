import { Miniflare } from "miniflare";
import { onTestFinished, test, vi } from "vitest";
import { useDispose } from "./test-shared";
import type { WorkerdStructuredLog } from "miniflare";

test("logs are written to the console by default when no `handleStructuredLogs` is provided", async ({
	expect,
}) => {
	const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	onTestFinished(() => {
		logSpy.mockRestore();
		errorSpy.mockRestore();
	});

	const mf = new Miniflare({
		modules: true,
		script: `
			export default {
				async fetch(req, env) {
				console.log('__LOG__');
				console.warn('__WARN__');
				console.error('__ERROR__');
				return new Response('Hello world!');
			}
		}`,
	});
	useDispose(mf);

	const response = await mf.dispatchFetch("http://localhost");
	await response.text();

	const stdout = logSpy.mock.calls.map((args) => args.join(" ")).join("\n");
	const stderr = errorSpy.mock.calls.map((args) => args.join(" ")).join("\n");

	// `log` goes to stdout; `warn`/`error` go to stderr
	expect(stdout).toContain("__LOG__");
	expect(stderr).toContain("__WARN__");
	expect(stderr).toContain("__ERROR__");
});

test("logs are structured and handled via `handleStructuredLogs` when such option is provided", async ({
	expect,
}) => {
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

test("when using `handleStructuredLogs` some known unhelpful logs are filtered out (e.g. CODE_MOVED warnings)", async ({
	expect,
}) => {
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
