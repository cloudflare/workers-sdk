import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
	buildCommand,
	buildContainerImages,
	initContainersSharedContext,
	InstanceType,
	SchedulingPolicy,
} from "../index";
import type { ContainerNormalizedConfig } from "../src/types";
import type { FetchResultFetcher, Logger } from "@cloudflare/workers-utils";

/**
 * A stand-in for the Podman CLI, used as `WRANGLER_DOCKER_BIN` / `--path-to-docker`,
 * as Wrangler's own "Docker CLI could not be launched" message suggests.
 *
 * Like `podman build` 5.x, it accepts the flags Docker's classic builder has
 * (`--load`, `-t`, `--platform`, `--build-arg`, `--network`, `-f -`, ...), but
 * rejects the BuildKit/buildx-only attestation flags with the same message and
 * exit code as Podman 5.4.2:
 *
 *   $ podman build --provenance=false -t t -f - . < Dockerfile
 *   Error: unknown flag: --provenance
 *   See 'podman build --help'
 *   (exit code 125)
 */
const FAKE_PODMAN = `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_PODMAN_LOG, JSON.stringify(args) + "\\n");
if (args[0] === "info") {
	process.exit(0);
}
if (args[0] === "build") {
	const unsupported = ["--provenance", "--attest", "--builder"];
	for (const arg of args.slice(1)) {
		const flag = arg.split("=")[0];
		if (unsupported.includes(flag)) {
			process.stderr.write(
				"Error: unknown flag: " + flag + "\\nSee 'podman build --help'\\n"
			);
			process.exit(125);
		}
	}
	// Consume the Dockerfile piped in with \`-f -\`.
	process.stdin.resume();
	process.stdin.on("end", () => process.exit(0));
	return;
}
process.exit(0);
`;

const logger: Logger = {
	debug: vi.fn(),
	log: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
};

let dir: string;
let podmanPath: string;
let podmanLog: string;

function podmanInvocations(): string[][] {
	return readFileSync(podmanLog, "utf-8")
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

describe.skipIf(process.platform === "win32")(
	"building container images with Podman as the Docker CLI (#9755)",
	() => {
		beforeEach(() => {
			dir = mkdtempSync(join(tmpdir(), "containers-shared-podman-"));
			podmanPath = join(dir, "podman");
			podmanLog = join(dir, "podman.log");
			writeFileSync(podmanPath, FAKE_PODMAN);
			chmodSync(podmanPath, 0o755);
			writeFileSync(podmanLog, "");
			writeFileSync(join(dir, "Dockerfile"), "FROM scratch\n");
			vi.stubEnv("FAKE_PODMAN_LOG", podmanLog);
			initContainersSharedContext({
				logger,
				fetchResult: vi.fn() as unknown as FetchResultFetcher,
			});
		});

		afterEach(() => {
			vi.unstubAllEnvs();
			removeDirSync(dir);
		});

		it("`wrangler containers build` builds the image with Podman", async ({
			expect,
		}) => {
			await expect(
				buildCommand({
					PATH: dir,
					tag: "hello-containers:0d302a66",
					pathToDocker: podmanPath,
					push: false,
				})
			).resolves.toBeUndefined();

			const build = podmanInvocations().find((args) => args[0] === "build");
			expect(build).toBeDefined();
			expect(build).not.toContain("--provenance=false");
		});

		it("`wrangler deploy` builds configured container images with Podman", async ({
			expect,
		}) => {
			const container = {
				name: "hello-containers",
				class_name: "MyContainer",
				dockerfile: join(dir, "Dockerfile"),
				image_build_context: dir,
				max_instances: 1,
				scheduling_policy: SchedulingPolicy.DEFAULT,
				rollout_step_percentage: [100],
				rollout_kind: "full_auto",
				rollout_active_grace_period: 0,
				instance_type: InstanceType.DEV,
				constraints: {},
				observability: { logs_enabled: true },
			} satisfies ContainerNormalizedConfig;

			const builtImages = await buildContainerImages([container], podmanPath);

			expect(builtImages).toHaveLength(1);
			expect(builtImages[0].localTag).toMatch(/^hello-containers:wrangler-/);
		});
	}
);
