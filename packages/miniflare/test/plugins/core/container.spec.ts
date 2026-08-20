import {
	containerPrivilegesAllowed,
	FUSE_CONTAINER_PRIVILEGES,
} from "@cloudflare/containers-shared";
import { getDockerPath } from "@cloudflare/workers-utils";
import { beforeEach, test, vi } from "vitest";
import {
	ContainerPrivilegesCache,
	getContainerPrivileges,
} from "../../../src/plugins/core/container";

vi.mock("@cloudflare/containers-shared", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/containers-shared")>()),
	containerPrivilegesAllowed: vi.fn(),
}));
vi.mock("@cloudflare/workers-utils", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/workers-utils")>()),
	getDockerPath: vi.fn(),
}));

beforeEach(() => {
	vi.mocked(containerPrivilegesAllowed).mockReset();
	vi.mocked(getDockerPath).mockReturnValue("custom-docker");
});

test("enables FUSE privileges for a safe container engine", async ({
	expect,
}) => {
	vi.mocked(containerPrivilegesAllowed).mockResolvedValue(true);
	const containerEngine = {
		localDocker: { socketPath: "unix:///custom/docker.sock" },
	};

	await expect(getContainerPrivileges(containerEngine)).resolves.toBe(
		FUSE_CONTAINER_PRIVILEGES
	);
	expect(containerPrivilegesAllowed).toHaveBeenCalledWith(
		"unix:///custom/docker.sock",
		"custom-docker"
	);
});

test("omits FUSE privileges for an unsafe container engine", async ({
	expect,
}) => {
	vi.mocked(containerPrivilegesAllowed).mockResolvedValue(false);

	await expect(
		getContainerPrivileges({
			localDocker: { socketPath: "unix:///var/run/docker.sock" },
		})
	).resolves.toBeUndefined();
});

test("propagates container engine inspection errors", async ({ expect }) => {
	vi.mocked(containerPrivilegesAllowed).mockRejectedValue(
		new Error("Docker is unavailable")
	);

	await expect(
		getContainerPrivileges({
			localDocker: { socketPath: "unix:///var/run/docker.sock" },
		})
	).rejects.toThrow("Docker is unavailable");
});

test("retries failed inspection", async ({ expect }) => {
	vi.mocked(containerPrivilegesAllowed)
		.mockRejectedValueOnce(new Error("Docker is unavailable"))
		.mockResolvedValueOnce(true);
	const cache = new ContainerPrivilegesCache();
	const containerEngine = {
		localDocker: { socketPath: "unix:///var/run/docker.sock" },
	};

	const first = cache.get(containerEngine);
	const second = cache.get(containerEngine);
	await expect(Promise.all([first, second])).resolves.toEqual([
		undefined,
		undefined,
	]);
	expect(containerPrivilegesAllowed).toHaveBeenCalledTimes(1);

	await expect(cache.get(containerEngine)).resolves.toBe(
		FUSE_CONTAINER_PRIVILEGES
	);
	expect(containerPrivilegesAllowed).toHaveBeenCalledTimes(2);
});

test("caches an unsafe engine decision", async ({ expect }) => {
	vi.mocked(containerPrivilegesAllowed).mockResolvedValue(false);
	const cache = new ContainerPrivilegesCache();
	const containerEngine = {
		localDocker: { socketPath: "unix:///var/run/docker.sock" },
	};

	await cache.get(containerEngine);
	await cache.get(containerEngine);

	expect(containerPrivilegesAllowed).toHaveBeenCalledTimes(1);
});

test("caches privileges until the container engine changes", async ({
	expect,
}) => {
	vi.mocked(containerPrivilegesAllowed).mockResolvedValue(true);
	const cache = new ContainerPrivilegesCache();
	const containerEngine = {
		localDocker: { socketPath: "unix:///var/run/docker.sock" },
	};

	await Promise.all([cache.get(containerEngine), cache.get(containerEngine)]);
	expect(containerPrivilegesAllowed).toHaveBeenCalledTimes(1);

	await cache.get({
		localDocker: { socketPath: "unix:///run/user/1000/docker.sock" },
	});
	expect(containerPrivilegesAllowed).toHaveBeenCalledTimes(2);

	cache.setEngine({
		localDocker: { socketPath: "unix:///another/docker.sock" },
	});
	cache.setEngine(containerEngine);
	await cache.get(containerEngine);
	expect(containerPrivilegesAllowed).toHaveBeenCalledTimes(3);
});
