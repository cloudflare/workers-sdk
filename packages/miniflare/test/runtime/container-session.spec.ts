import childProcess from "node:child_process";
import crypto from "node:crypto";
import { once } from "node:events";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { LogLevel, Miniflare } from "miniflare";
import { test as baseTest, onTestFinished, vi } from "vitest";
import { removeContainerSession } from "../../src/runtime/container-session";
import { singleModuleManifest, TestLog, useDispose } from "../test-shared";
import type { MiniflareOptions } from "miniflare";

const SESSION_LABEL = "dev.workerd.session";

// Local Containers do not support native Windows.
const test = baseTest.skipIf(process.platform === "win32");

type Labels = Record<string, string>;

interface DockerContainer {
	Id: string;
	Names: string[];
	Labels: Labels;
	HostConfig: { NetworkMode: string };
	mountedVolumes: string[];
}

/**
 * Serves the Docker Engine API endpoints that sessions are removed through.
 * Like Podman, it refuses to remove a container whose network namespace
 * another container joins, and like Docker, a volume that a container mounts.
 */
async function startDockerEngine() {
	const socketPath = path.join(
		os.tmpdir(),
		`miniflare-docker-${crypto.randomBytes(4).toString("hex")}.sock`
	);
	const containers = new Map<string, DockerContainer>();
	const volumes = new Map<string, Labels>();
	const engine = {
		socketPath: `unix://${socketPath}`,
		containers,
		volumes,
		/** Session ID of each container listing, in order. */
		listedSessions: [] as string[],
		afterListing: () => {},
		addContainer(
			name: string,
			labels: Labels,
			{
				networkOf,
				mountedVolumes = [],
			}: { networkOf?: string; mountedVolumes?: string[] } = {}
		) {
			containers.set(name, {
				Id: name,
				Names: [`/${name}`],
				Labels: labels,
				HostConfig: {
					NetworkMode:
						networkOf === undefined ? "bridge" : `container:${networkOf}`,
				},
				mountedVolumes,
			});
		},
	};
	const server = http.createServer((req, res) => {
		const url = new URL(req.url ?? "/", "http://localhost");
		const filters = JSON.parse(url.searchParams.get("filters") ?? "{}") as {
			label?: string[];
		};
		const [labelName, labelValue] = filters.label?.[0]?.split("=") ?? [];
		const matches = (labels: Labels) =>
			labelName !== undefined && labels[labelName] === labelValue;
		const respond = (status: number, body?: unknown) =>
			res
				.writeHead(status)
				.end(body === undefined ? undefined : JSON.stringify(body));
		const [, resource, id = ""] = url.pathname.split("/");
		const name = decodeURIComponent(id);
		const users = [...containers.values()].filter(
			({ HostConfig, mountedVolumes }) =>
				HostConfig.NetworkMode === `container:${name}` ||
				mountedVolumes.includes(name)
		);
		if (req.method === "GET" && url.pathname === "/containers/json") {
			engine.listedSessions.push(labelValue ?? "");
			respond(
				200,
				[...containers.values()].filter(({ Labels }) => matches(Labels))
			);
			engine.afterListing();
		} else if (req.method === "GET" && url.pathname === "/volumes") {
			const Volumes = [...volumes]
				.filter(([, labels]) => matches(labels))
				.map(([Name, Labels]) => ({ Name, Labels }));
			respond(200, { Volumes });
		} else if (
			req.method === "DELETE" &&
			(resource === "containers" || resource === "volumes")
		) {
			const resources = resource === "containers" ? containers : volumes;
			if (!resources.has(name)) {
				respond(404);
			} else if (users.length > 0) {
				respond(409, { message: `${name} is in use` });
			} else {
				resources.delete(name);
				respond(204);
			}
		} else {
			respond(404);
		}
	});
	await new Promise<void>((resolve) => server.listen(socketPath, resolve));
	onTestFinished(() => {
		server.closeAllConnections();
		return new Promise<void>((resolve) => server.close(() => resolve()));
	});
	return engine;
}

function containerOptions(
	socketPath: string,
	imageName: string,
	response = ""
): MiniflareOptions {
	return {
		containerEngine: socketPath,
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(`
						export class ContainerObject {}
						export default {
							fetch() { return new Response(${JSON.stringify(response)}); }
						};
					`),
					exports: {
						ContainerObject: {
							type: "durable-object",
							storage: "sqlite",
							container: { imageName },
						},
					},
				},
			},
		],
	};
}

test("removes a session's containers and volumes, dependents first", async ({
	expect,
}) => {
	const docker = await startDockerEngine();
	const labels = { [SESSION_LABEL]: "a" };
	docker.addContainer("sidecar", labels);
	docker.volumes.set("clone", labels);
	docker.addContainer("app", labels, {
		networkOf: "sidecar",
		mountedVolumes: ["clone"],
	});
	docker.addContainer("other-session", { [SESSION_LABEL]: "b" });
	docker.volumes.set("snapshot", {});

	await removeContainerSession(
		{ id: "a", fingerprint: "", socketPath: docker.socketPath },
		new TestLog()
	);

	expect([...docker.containers.keys()]).toEqual(["other-session"]);
	expect([...docker.volumes.keys()]).toEqual(["snapshot"]);
});

test("removes containers created after the first pass listed the session", async ({
	expect,
}) => {
	const docker = await startDockerEngine();
	// Docker can complete a create that it accepted before workerd was killed.
	docker.afterListing = () => {
		docker.afterListing = () => {};
		docker.addContainer("late", { [SESSION_LABEL]: "a" });
	};

	await removeContainerSession(
		{ id: "a", fingerprint: "", socketPath: docker.socketPath },
		new TestLog()
	);

	expect([...docker.containers.keys()]).toEqual([]);
});

test("ends a Container session when its Container configuration changes", async ({
	expect,
}) => {
	const docker = await startDockerEngine();
	const mf = new Miniflare(containerOptions(docker.socketPath, "app:1", "1"));
	useDispose(mf);
	await mf.ready;
	// workerd adopts the session's running containers across code changes.
	await mf.setOptions(containerOptions(docker.socketPath, "app:1", "2"));
	await mf.setOptions(containerOptions(docker.socketPath, "app:2", "2"));
	await vi.waitFor(() => expect(docker.listedSessions).toHaveLength(2));

	await mf.dispose();

	const [first, , second] = docker.listedSessions;
	expect(second).not.toBe(first);
	expect(docker.listedSessions).toEqual([first, first, second, second]);
});

test("removes the Container session after the process exits without dispose()", async ({
	expect,
}) => {
	const docker = await startDockerEngine();
	const child = childProcess.spawn(
		process.execPath,
		[
			"-e",
			`const { Miniflare } = require(${JSON.stringify(require.resolve("miniflare"))});
			new Miniflare(JSON.parse(process.argv[1])).ready.then(() => process.exit());`,
			JSON.stringify(containerOptions(docker.socketPath, "app:1")),
		],
		{ stdio: "ignore" }
	);
	await once(child, "exit");

	await vi.waitFor(() => expect(docker.listedSessions).toHaveLength(2), {
		timeout: 10_000,
	});
	expect(docker.listedSessions[1]).toBe(docker.listedSessions[0]);
});

test("logs how to remove a session that it cannot remove", async ({
	expect,
}) => {
	const log = new TestLog();
	const socketPath = path.join(os.tmpdir(), "miniflare-missing-docker.sock");

	await removeContainerSession(
		{ id: "a", fingerprint: "", socketPath: `unix://${socketPath}` },
		log
	);

	expect(log.logsAtLevel(LogLevel.WARN)).toEqual([
		expect.stringContaining(
			`docker rm --force $(docker ps --all --quiet --filter label=${SESSION_LABEL}=a)`
		),
	]);
});
