import { execFileSync, spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import path from "node:path";
import { it } from "vitest";
import type { ChildProcess } from "node:child_process";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../../..");
const FIXTURE_ROOT = path.join(
	REPOSITORY_ROOT,
	"fixtures/vitest-plugin-examples"
);
const RUN_ID_ENV = "VITEST_CONTAINER_RUN_ID";

function isDockerRunning(): boolean {
	try {
		execFileSync("docker", ["ps"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

function getRuntimeContainers(nameFilter: string): Map<string, string> {
	const output = execFileSync(
		"docker",
		[
			"ps",
			"-a",
			"--no-trunc",
			"--filter",
			`name=${nameFilter}`,
			"--format",
			"{{.ID}}\t{{.Names}}",
		],
		{ encoding: "utf8" }
	);
	return new Map(
		output
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => {
				const [id, name] = line.split("\t");
				if (id === undefined || name === undefined) {
					throw new Error(`Unexpected Docker output: ${line}`);
				}
				return [id, name] as const;
			})
	);
}

async function terminateChild(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) {
		return;
	}
	const closed = once(child, "close");
	child.kill("SIGTERM");
	await closed;
}

const dockerTest = isDockerRunning() ? it : it.skip;

dockerTest(
	"removes application containers and sidecars after Vitest exits",
	{ timeout: 60_000 },
	async ({ expect }) => {
		const runId = randomBytes(6).toString("hex");
		const containerNameFilter = `workerd-vitest-plugin-runner-container-app-${runId}-`;
		const observedContainers = new Map<string, string>();
		const observeContainers = () => {
			for (const [id, name] of getRuntimeContainers(containerNameFilter)) {
				observedContainers.set(id, name);
			}
		};

		const child = spawn(
			"pnpm",
			[
				"exec",
				"vitest",
				"run",
				"--root",
				"container-app",
				"--config",
				"vitest.config.ts",
			],
			{
				cwd: FIXTURE_ROOT,
				env: { ...process.env, [RUN_ID_ENV]: runId },
				stdio: ["ignore", "pipe", "pipe"],
			}
		);
		let output = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			output += chunk;
		});
		child.stderr.on("data", (chunk: string) => {
			output += chunk;
		});
		const interval = setInterval(observeContainers, 25);

		try {
			const [exitCode, signal] = await once(child, "close");
			observeContainers();
			expect(signal, output).toBeNull();
			expect(exitCode, output).toBe(0);

			const containers = [...observedContainers.entries()];
			expect(containers, output).toHaveLength(4);
			expect(
				containers.filter(([, name]) => name.endsWith("-proxy")),
				output
			).toHaveLength(2);
			expect(
				containers.filter(([, name]) => !name.endsWith("-proxy")),
				output
			).toHaveLength(2);

			const remainingIds = containers
				.map(([id]) => id)
				.filter((id) => spawnSync("docker", ["inspect", id]).status === 0);
			expect(remainingIds, output).toEqual([]);
		} finally {
			clearInterval(interval);
			await terminateChild(child);
		}
	}
);
