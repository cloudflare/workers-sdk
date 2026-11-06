import childProcess from "node:child_process";
import crypto from "node:crypto";
import http from "node:http";
import type { Log } from "../shared";
import type { Config } from "./config";

/** Label workerd puts on the Docker resources of a session. */
const SESSION_LABEL = "dev.workerd.session";

/** Delay before the second removal pass; see `removeSessionResources()`. */
const SECOND_PASS_DELAY_MS = 250;

/**
 * Time a Docker request may go without activity. A daemon that accepts a
 * connection but never responds would otherwise stall removal, and with it
 * `Miniflare.dispose()`.
 */
const DOCKER_REQUEST_TIMEOUT_MS = 30_000;

/**
 * The Docker resources workerd creates for one Container configuration.
 *
 * A session spans every workerd process Miniflare starts with the same
 * Container configuration: workerd names and labels the resources with the
 * session ID, and a restarted process adopts the running containers. Miniflare
 * removes the resources once the session ends.
 */
export interface ContainerSession {
	id: string;
	/** Identifies the Container configuration the session belongs to. */
	fingerprint: string;
	/** Docker Engine socket that the session's workerd processes use. */
	socketPath: string;
}

/**
 * Chooses the Container session for an assembled workerd configuration and
 * writes its ID into the configuration. The current session continues if the
 * Container configuration is unchanged; otherwise a new session starts.
 *
 * @param config Assembled workerd configuration, updated in place.
 * @param socketPath Docker Engine socket that every Worker's Containers use.
 * @param current Session of the running workerd, if any.
 * @returns The session to run `config` in, if it has Containers, and the
 * session it ends, if any.
 */
export function assignContainerSession(
	config: Config,
	socketPath: string,
	current: ContainerSession | undefined
): { session?: ContainerSession; ended?: ContainerSession } {
	const fingerprint = getContainerFingerprint(config);
	if (fingerprint === undefined) {
		return { ended: current };
	}
	const session =
		current?.fingerprint === fingerprint
			? current
			: { id: crypto.randomBytes(8).toString("hex"), fingerprint, socketPath };
	for (const service of config.services ?? []) {
		const docker =
			"worker" in service
				? service.worker?.containerEngine?.localDocker
				: undefined;
		if (docker !== undefined) {
			docker.sessionId = session.id;
		}
	}
	return { session, ended: session === current ? undefined : current };
}

/**
 * Fingerprints the Container configuration of `config`: every
 * Container-enabled Durable Object namespace, with its service and Docker
 * engine settings.
 *
 * @param config Assembled workerd configuration.
 * @returns The fingerprint, or `undefined` when no Durable Object namespace
 * has a container.
 */
function getContainerFingerprint(config: Config): string | undefined {
	const namespaces: unknown[] = [];
	for (const service of config.services ?? []) {
		const worker = "worker" in service ? service.worker : undefined;
		const docker = worker?.containerEngine?.localDocker;
		for (const namespace of worker?.durableObjectNamespaces ?? []) {
			if (namespace.container === undefined || docker === undefined) {
				continue;
			}
			namespaces.push({
				service: service.name,
				namespace,
				engine: docker,
			});
		}
	}
	return namespaces.length === 0 ? undefined : JSON.stringify(namespaces);
}

/**
 * Removes the Docker resources of a session whose workerd processes have all
 * exited. Nothing retries a failed removal, so a failure is logged with the
 * commands that remove the resources by hand instead of rejecting.
 *
 * @param session Session to remove.
 * @param log Log for the outcome.
 * @param requestTimeoutMs Time each Docker request may go without activity.
 */
export async function removeContainerSession(
	session: ContainerSession,
	log: Log,
	requestTimeoutMs = DOCKER_REQUEST_TIMEOUT_MS
): Promise<void> {
	const label = `${SESSION_LABEL}=${session.id}`;
	try {
		const removed = await removeSessionResources(
			http,
			getNodeSocketPath(session.socketPath),
			label,
			SECOND_PASS_DELAY_MS,
			requestTimeoutMs
		);
		log.debug(
			`Removed Container session ${session.id}: ${removed.join(", ") || "nothing to remove"}`
		);
	} catch (error) {
		log.warn(
			`Could not remove the Docker resources of Container session ${session.id}: ${String(error)}\n` +
				`To remove them, run:\n` +
				`  docker rm --force $(docker ps --all --quiet --filter label=${label})\n` +
				`  docker volume rm $(docker volume ls --quiet --filter label=${label})`
		);
	}
}

/**
 * Starts removing a session's Docker resources in a detached Node.js process,
 * for exit hooks, where the event loop never runs again. The process outlives
 * Miniflare's, and it is outside Miniflare's process group: exit hooks often
 * run because the terminal signalled that group, and the terminal may signal
 * it again, for example with `SIGHUP` when the shell exits.
 *
 * @param session Session to remove.
 */
export function removeContainerSessionDetached(
	session: ContainerSession
): void {
	const args = JSON.stringify([
		getNodeSocketPath(session.socketPath),
		`${SESSION_LABEL}=${session.id}`,
		SECOND_PASS_DELAY_MS,
		DOCKER_REQUEST_TIMEOUT_MS,
	]);
	const script = `(${removeSessionResources.toString()})(require("node:http"), ...JSON.parse(process.argv[1]))`;
	childProcess
		.spawn(process.execPath, ["-e", script, args], {
			// Inherited debugger flags such as `--inspect-brk` would stop the
			// process before it removes anything.
			env: {
				...process.env,
				NODE_OPTIONS: undefined,
				ELECTRON_RUN_AS_NODE: "1",
			},
			detached: true,
			stdio: "ignore",
			windowsHide: true,
		})
		.unref();
}

/**
 * Converts a workerd Docker socket setting such as `unix:///var/run/docker.sock`
 * into a Node.js `socketPath`.
 *
 * @param socketPath Docker socket setting.
 */
function getNodeSocketPath(socketPath: string): string {
	return socketPath.replace(/^unix:(\/\/)?/, "");
}

/**
 * Removes the containers and volumes that carry `label`, dependents first:
 * the containers whose network namespace no other container joins, then the
 * sidecars they join, then the volumes that containers mount. Docker refuses
 * to remove a volume in use, and Podman also refuses to remove a container
 * whose network namespace another container joins. A create that Docker
 * accepted before workerd was killed can complete after the first listing,
 * so a second pass runs after `secondPassDelayMs`.
 *
 * `removeContainerSessionDetached()` runs this function's source in another
 * process, so it may use only its parameters and globals.
 *
 * @param httpModule `node:http`.
 * @param socketPath Docker Engine socket.
 * @param label Docker label filter selecting the session's resources.
 * @param secondPassDelayMs Delay before the second pass.
 * @param requestTimeoutMs Time each Docker request may go without activity.
 * @returns Names of the removed containers and volumes.
 */
async function removeSessionResources(
	httpModule: typeof http,
	socketPath: string,
	label: string,
	secondPassDelayMs: number,
	requestTimeoutMs: number
): Promise<string[]> {
	interface DockerContainer {
		Id: string;
		Names: string[];
		HostConfig?: { NetworkMode?: string };
	}
	function request(method: string, path: string): Promise<string> {
		return new Promise((resolve, reject) => {
			const req = httpModule.request(
				{ socketPath, method, path, timeout: requestTimeoutMs },
				(res) => {
					let body = "";
					res.setEncoding("utf8");
					res.on("data", (chunk: string) => (body += chunk));
					res.on("error", reject);
					res.on("end", () => {
						const status = res.statusCode ?? 0;
						// A resource that is already gone needs no removal.
						if (
							(status >= 200 && status < 300) ||
							(method === "DELETE" && status === 404)
						) {
							resolve(body);
						} else {
							reject(
								new Error(
									`Docker ${method} ${path} failed: [${status}] ${body}`
								)
							);
						}
					});
				}
			);
			req.on("timeout", () =>
				req.destroy(
					new Error(
						`Docker ${method} ${path} did not respond within ${requestTimeoutMs} ms`
					)
				)
			);
			req.on("error", reject);
			req.end();
		});
	}
	const removed: string[] = [];
	async function removeContainer(container: DockerContainer): Promise<void> {
		await request("DELETE", `/containers/${container.Id}?force=1`);
		removed.push(container.Names[0]?.replace(/^\//, "") ?? container.Id);
	}
	async function removeVolume(name: string): Promise<void> {
		await request("DELETE", `/volumes/${encodeURIComponent(name)}`);
		removed.push(name);
	}
	const filters = encodeURIComponent(JSON.stringify({ label: [label] }));
	for (const pass of [1, 2]) {
		if (pass === 2) {
			await new Promise((resolve) => setTimeout(resolve, secondPassDelayMs));
		}
		const containers = JSON.parse(
			await request("GET", `/containers/json?all=1&filters=${filters}`)
		) as DockerContainer[];
		const { Volumes: volumes } = JSON.parse(
			await request("GET", `/volumes?filters=${filters}`)
		) as { Volumes: { Name: string }[] | null };
		// Containers whose network namespace another container joins. workerd
		// joins each sidecar by name, so match names as well as IDs.
		const joined = new Set(
			containers.flatMap(({ HostConfig }) => {
				const mode = HostConfig?.NetworkMode ?? "";
				return mode.startsWith("container:")
					? [mode.slice("container:".length)]
					: [];
			})
		);
		const isJoined = ({ Id, Names }: DockerContainer) =>
			joined.has(Id) ||
			Names.some((name) => joined.has(name.replace(/^\//, "")));
		await Promise.all(
			containers
				.filter((container) => !isJoined(container))
				.map(removeContainer)
		);
		await Promise.all(containers.filter(isJoined).map(removeContainer));
		await Promise.all((volumes ?? []).map(({ Name }) => removeVolume(Name)));
	}
	return removed;
}
