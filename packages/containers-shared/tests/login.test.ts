import { PassThrough } from "node:stream";
import { afterEach, describe, it, vi } from "vitest";
import { initContainersSharedContext } from "../src/context";
import { dockerLoginImageRegistry } from "../src/login";
import type { FetchResultFetcher } from "@cloudflare/workers-utils";

const spawn = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
	spawn,
}));

describe("dockerLoginImageRegistry", () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	it("fetches registry credentials and passes them to docker login", async ({
		expect,
	}) => {
		const fetchResult = vi.fn(async () => ({
			username: "v1",
			password: "secret",
		}));
		initContainersSharedContext({
			accountId: "abc123",
			apiFamily: "containers",
			fetchResult: fetchResult as FetchResultFetcher,
		});

		const stdin = new PassThrough();
		const child = Object.assign(new PassThrough(), {
			stdin,
		});
		spawn.mockReturnValue(child);
		const writes: string[] = [];
		stdin.on("data", (chunk) => writes.push(chunk.toString()));

		const login = dockerLoginImageRegistry(
			"docker",
			"registry.cloudflare.com",
			{ compliance_region: "public" }
		);
		await vi.waitFor(() => {
			expect(spawn).toHaveBeenCalled();
		});
		child.emit("close", 0);
		await login;

		expect(fetchResult).toHaveBeenCalledWith(
			{ compliance_region: "public" },
			"/accounts/abc123/containers/registries/registry.cloudflare.com/credentials",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
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
				"v1",
				"registry.cloudflare.com",
			],
			{ stdio: ["pipe", "inherit", "inherit"] }
		);
		expect(writes).toEqual(["secret"]);
	});

	it("uses the configured API family for registry credentials", async ({
		expect,
	}) => {
		const fetchResult = vi.fn(async () => ({
			username: "v1",
			password: "secret",
		}));
		initContainersSharedContext({
			accountId: "abc123",
			apiFamily: "cloudchamber",
			fetchResult: fetchResult as FetchResultFetcher,
		});

		const child = Object.assign(new PassThrough(), {
			stdin: new PassThrough(),
		});
		spawn.mockReturnValue(child);

		const login = dockerLoginImageRegistry(
			"docker",
			"registry.cloudflare.com",
			{ compliance_region: "public" }
		);
		await vi.waitFor(() => {
			expect(spawn).toHaveBeenCalled();
		});
		child.emit("close", 0);
		await login;

		expect(fetchResult).toHaveBeenCalledWith(
			{ compliance_region: "public" },
			"/accounts/abc123/cloudchamber/registries/registry.cloudflare.com/credentials",
			expect.any(Object)
		);
	});
});
