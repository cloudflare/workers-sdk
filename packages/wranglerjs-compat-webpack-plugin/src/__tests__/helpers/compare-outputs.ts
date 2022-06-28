import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Writable as WritableStream } from "node:stream";
import { execa } from "execa";
import { mockConsoleMethods } from "wrangler/src/__tests__/helpers/mock-console";
import { runWrangler as runWrangler2 } from "wrangler/src/__tests__/helpers/run-wrangler";
import { writeWorkerSource } from "wrangler/src/__tests__/helpers/write-worker-source";
import writeWranglerToml from "wrangler/src/__tests__/helpers/write-wrangler-toml";
import { PATH_TO_PLUGIN } from "./constants";
import { mockSubDomainRequest } from "./mock-subdomain-request";
import { mockUploadWorkerRequest } from "./mock-upload-worker-request";
import { pipe } from "./pipe";
import { runWrangler1 } from "./run-wrangler-1";
import { writePackageJson } from "./write-package-json";
import { writeWebpackConfig } from "./write-webpack-config";
import type { CoreProperties } from "@schemastore/package";
import type { ExecaError, ExecaReturnValue } from "execa";
import type webpack from "webpack";
import type { RawConfig } from "wrangler/src/config";
// import process from "node:process";

type PartialWranglerConfig = Omit<RawConfig, "type" | "webpack_config">;
type PartialWorker = Omit<
	Extract<Parameters<typeof writeWorkerSource>[0], Record<string, unknown>>,
	"basePath" | "format"
>;

export type ProjectOptions = {
	wranglerConfig?: PartialWranglerConfig;
	worker?: PartialWorker;
	webpackConfig?: webpack.Configuration;
	packageJson?: CoreProperties;
};

const std = mockConsoleMethods();

export async function compareOutputs({
	wranglerConfig,
	worker,
	webpackConfig,
	packageJson,
}: ProjectOptions) {
	const parentDir = process.cwd();
	const wrangler1Dir = path.join(parentDir, "wrangler-1");
	const wrangler2Dir = path.join(parentDir, "wrangler-2");

	// wrangler 1
	fs.mkdirSync(wrangler1Dir);
	process.chdir(wrangler1Dir);

	writeWranglerToml({
		...wranglerConfig,
		type: "webpack",
		webpack_config: "webpack.config.js",
	});
	writeWorkerSource(worker);
	writeWebpackConfig(webpackConfig);
	writePackageJson(packageJson);

	let wrangler1result: ExecaReturnValue<string> | ExecaError<string>;
	try {
		wrangler1result = await runWrangler1("build");
	} catch (e) {
		const error = e as ExecaError<string>;
		if (isAssertionError(error)) {
			throw error;
		} else {
			wrangler1result = error;
		}

		if (os.platform() === "win32") {
			throw error;
		}
	}

	const wrangler1 = {
		result: wrangler1result,
		std: {
			out: std.out,
			err: std.err,
			warn: std.warn,
		},
		output: walk(path.join(wrangler1Dir, "worker")),
	};

	clearConsole();

	mockUploadWorkerRequest({
		expectedType: worker?.type,
		expectedName: "script.js",
	});
	mockSubDomainRequest();

	// wrangler 2
	fs.mkdirSync(wrangler2Dir);
	process.chdir(wrangler2Dir);

	writeWranglerToml({
		...wranglerConfig,
		build: {
			...wranglerConfig?.build,
			command: "npm run build",
		},
	});
	writeWorkerSource(worker);
	writeWebpackConfig(webpackConfig, { usePlugin: true });
	writePackageJson({
		...packageJson,
		scripts: {
			...packageJson?.scripts,
			build: "webpack --no-color",
		},
		dependencies: {
			...packageJson?.dependencies,
			webpack: "^4.46.0",
			"webpack-cli": "^4.9.2",
			"wranglerjs-compat-webpack-plugin": PATH_TO_PLUGIN,
		},
	});

	await execa("npm", ["install"], {
		cwd: wrangler2Dir,
	});

	let wrangler2result: Error | undefined = undefined;

	// we need to capture webpack output
	const stdout = new WritableStream({
		write: pipe((message) => {
			if (!message.includes("WARNING")) {
				console.log(message);
			} else {
				const [output, warning] = message.split("WARNING");
				console.log(output);
				console.warn(`WARNING ${warning}`);
			}
		}),
	});
	const stderr = new WritableStream({
		write: pipe(console.error),
	});

	try {
		await withCapturedChildProcessOutput(
			async () => await runWrangler2("publish"),
			{
				stdout,
				stderr,
			}
		);
	} catch (e) {
		wrangler2result = e as Error;
	} finally {
		process.stdout.unpipe(stdout);
		process.stderr.unpipe(stderr);
	}

	// an assertion failed, so we should throw
	if (wrangler2result !== undefined && isAssertionError(wrangler2result)) {
		throw wrangler2result;
	}

	const wrangler2 = {
		result: wrangler2result,
		std: {
			out: std.out,
			err: std.err,
			warn: std.warn,
		},
		output: walk(path.join(wrangler2Dir, "worker")),
	};

	return { wrangler1, wrangler2 };
}

/**
 * Clear the console by resetting mocks to console.log, .error, and .warn
 */
const clearConsole = () => {
	(console.log as jest.Mock).mockClear();
	(console.warn as jest.Mock).mockClear();
	(console.error as jest.Mock).mockClear();
};

/**
 * Jest errors aren't exported directly as a type, so this hacky garbage
 * checks if an error has a "matcherResult" property, which all jest errors
 * have.
 */
const isAssertionError = (e: Error) =>
	Object.prototype.hasOwnProperty.bind(e)("matcherResult");

/**
 * Temporarily capture output of processes spawned by `child_process.spawn()`
 * when the `fn` arg is called. All output will be piped through to the
 * `stdout` and `stderr` args, which can be arbitrary streams.
 *
 * Useful for capturing output from webpack when called by wrangler 2.
 * @returns the result of calling `fn`
 */
async function withCapturedChildProcessOutput<T>(
	fn: () => T | Promise<T>,
	{ stdout, stderr }: { stdout: WritableStream; stderr: WritableStream }
): Promise<T> {
	const { spawn } = childProcess;
	let process: childProcess.ChildProcess | undefined = undefined;
	const childProcessMock = jest
		.spyOn(childProcess, "spawn")
		.mockImplementation((command, args, options) => {
			process = spawn(command, args, options);
			if (process.stdout !== null && process.stderr !== null) {
				process.stdout.pipe(stdout);
				process.stderr.pipe(stderr);
			}
			return process;
		});

	try {
		return await fn();
	} finally {
		if (process.stdout !== null && process.stderr !== null) {
			process.stdout.unpipe(stdout);
			process.stderr.unpipe(stderr);
		}
		childProcessMock.mockRestore();
	}
}

/**
 * Walk a directory, reading all files into an object keyed by their filenames
 */
function walk(dir: string): DirectoryContent {
	const entries: DirectoryContent = {};

	fs.readdirSync(dir).forEach((entry) => {
		const entryPath = path.resolve(dir, entry);
		if (fs.lstatSync(entryPath).isDirectory()) {
			entries[entry] = walk(entryPath);
		} else {
			entries[entry] = fs.readFileSync(entryPath);
		}
	});

	return entries;
}

type DirectoryContent = { [key: string]: Buffer | DirectoryContent };
