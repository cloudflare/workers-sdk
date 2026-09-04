import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { Writable } from "node:stream";
import { beforeEach, describe, it, vi } from "vitest";
import {
	getCloudflareContainerRegistry,
	initContainersSharedContext,
	dockerLoginImageRegistry,
} from "../index";
import type { FetchResultFetcher, Logger } from "@cloudflare/workers-utils";

vi.mock("node:child_process");

const logger: Logger = {
	debug: vi.fn(),
	log: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
};

let fetchResultMock: FetchResultFetcher;
let stdinChunks: string[];

function createFakeChildProcess(): ChildProcess {
	const child = new EventEmitter() as ChildProcess;
	const stdin = new Writable({
		write(chunk, _encoding, callback) {
			stdinChunks.push(String(chunk));
			callback();
		},
	});

	Object.assign(child, {
		stdin,
	});

	process.nextTick(() => {
		child.emit("close", 0);
	});

	return child;
}

describe("loginImageRegistry", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		stdinChunks = [];
		vi.mocked(spawn).mockReturnValue(createFakeChildProcess());
		fetchResultMock = vi.fn(async <ResponseType>() => {
			return {
				account_id: "some-account-id",
				username: "username",
				password: "password",
				registry_host: getCloudflareContainerRegistry(),
			} as ResponseType;
		}) as FetchResultFetcher;
		initContainersSharedContext({ logger, fetchResult: fetchResultMock });
	});

	it("gets registry credentials with fetchResult before running docker login", async ({
		expect,
	}) => {
		await dockerLoginImageRegistry(
			"docker",
			getCloudflareContainerRegistry(),
			"some-account-id"
		);

		expect(vi.mocked(fetchResultMock)).toHaveBeenCalledWith(
			{},
			"/accounts/some-account-id/containers/registries/registry.cloudflare.com/credentials",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					expiration_minutes: 15,
					permissions: ["push", "pull"],
				}),
			}
		);
		expect(spawn).toHaveBeenCalledWith(
			"docker",
			[
				"login",
				"--password-stdin",
				"--username",
				"username",
				getCloudflareContainerRegistry(),
			],
			{ stdio: ["pipe", "inherit", "inherit"] }
		);
		expect(stdinChunks).toStrictEqual(["password"]);
	});
});
