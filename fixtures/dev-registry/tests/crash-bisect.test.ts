/**
 * TEMPORARY EXPERIMENT — not for merge.
 *
 * Windows CI results so far:
 *   1  4 arms run concurrently with dev-registry.test.ts     assets 3/8, plain 0/8
 *   2  same arms isolated, + order swap, + wrangler arm      0/24
 *   3  2/3/4 concurrent idle sessions, + port fallback       0/17
 *   4  long-lived victim + one stressor each                 11/12
 *   5  peer startup vs cpu starvation (rewritten harness)    0/12
 *   6  round 4's harness verbatim, context captured          13/17
 *        peer churn 4/5, churn+traffic 4/5, traffic 1/4, cpu 0/3
 *   7  what exactly is needed, merged timestamped logs
 *        alpha  7-10 forced restarts, no peer               0/3
 *        beta   registry entries written/deleted by hand     0/3
 *        gamma  real peer, SIGKILLed                        3/3
 *        delta  untouched                                   0/3
 *
 * So neither restarting the victim nor feeding it registry churn does anything.
 * It takes a real peer process that starts, gets wired up, and then dies
 * abruptly. This round pins down which part of that matters:
 *
 *   epsilon  peer killed forcefully, assets + tail consumer   4/5
 *   zeta     "graceful" stop                                   1/3  (void:
 *            taskkill /T never actually stopped vite on Windows,
 *            cleanExits was 0, so this arm just re-ran epsilon)
 *   eta      peer without assets, killed                       0/3  (11 cycles)
 *   theta    unrelated assets peer, killed                     0/3  (14 cycles)
 *
 * An assets peer on its own is not enough (theta) and a bound peer is not
 * enough (eta). The only peer that kills the victim is the one that is both an
 * assets worker and the victim's tail consumer - so the tail path through the
 * assets RPC proxy hop. Every round so far ran without the fix on
 * https://github.com/cloudflare/workers-sdk/pull/14993, which makes exactly
 * that path stop dropping rejections on the floor.
 *
 * THIS RUN SITS ON TOP OF THAT FIX. Baseline to beat: epsilon crashed 4/5 reps,
 * 17 kill cycles. Same arm, 8 reps, plus both negative controls.
 */
import childProcess from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { resolve } from "node:path";
import kill from "tree-kill";
/* eslint-disable workers-sdk/no-vitest-import-expect -- module-scope helpers */
import { afterAll, describe, onTestFinished, test } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */

const cwd = resolve(__dirname, "..");
const tmpPathBase = path.join(os.tmpdir(), "wrangler-tests");
const REPS = 8;
const OBSERVE_MS = 30_000;
const CRASH =
	/std::terminate|Fatal uncaught|Received signal|crashed unexpectedly/;

const VICTIM = "exported-handler";
const PEER = "worker-entrypoint-with-assets";
const PEER_NO_ASSETS = "worker-entrypoint";
const PEER_UNRELATED = "exported-handler-with-assets";

// eslint-disable-next-line no-control-regex -- strip terminal colour codes
const ANSI = /\u001B\[[0-9;]*[A-Za-z]/g;

function stripAnsi(value: string) {
	return value.replace(ANSI, "");
}

const results: {
	arm: string;
	rep: number;
	atMs: number | null;
	cycles: number;
	cleanExits: number;
}[] = [];
let dumped = 0;

function spawnMerged(config: string, registry: string, clock: () => number) {
	const proc = childProcess.spawn(
		"pnpm",
		["vite", "--config", `vite.${config}.config.ts`],
		{
			cwd,
			shell: true,
			env: { ...process.env, MINIFLARE_REGISTRY_PATH: registry },
		}
	);
	let merged = "";
	let raw = "";
	const attach = (stream: "out" | "err", s: NodeJS.ReadableStream | null) => {
		s?.setEncoding("utf8");
		s?.on("data", (chunk: string) => {
			raw += chunk;
			for (const line of chunk.split(/\r?\n/)) {
				if (line.trim() !== "") {
					merged += `+${clock()}ms [${stream}] ${stripAnsi(line)}\n`;
				}
			}
		});
	};
	attach("out", proc.stdout);
	attach("err", proc.stderr);

	let dead = false;
	const closed = new Promise<void>((res) =>
		proc.once("close", () => {
			dead = true;
			res();
		})
	);

	function force() {
		return new Promise<void>((res) => {
			if (dead || !proc.pid) {
				return res();
			}
			kill(proc.pid, "SIGKILL", () => res());
		});
	}

	/**
	 * Ask the tree to close rather than shooting it: tree-kill always passes
	 * /T /F on Windows, which is exactly the abruptness under test.
	 */
	function requestStop() {
		if (dead || !proc.pid) {
			return;
		}
		if (process.platform === "win32") {
			childProcess.spawn("taskkill", ["/pid", String(proc.pid), "/T"], {
				stdio: "ignore",
			});
		} else {
			kill(proc.pid, "SIGTERM", () => {});
		}
	}

	onTestFinished(force);

	return {
		force,
		requestStop,
		exited: () => dead,
		log: () => merged,
		async waitForExit(timeoutMs: number) {
			await Promise.race([
				closed,
				new Promise((r) => setTimeout(r, timeoutMs)),
			]);
			return dead;
		},
		async ready(timeoutMs = 40_000) {
			const deadline = Date.now() + timeoutMs;
			while (Date.now() < deadline && !/Local:/.test(stripAnsi(raw))) {
				await new Promise((r) => setTimeout(r, 200));
			}
			return /Local:/.test(stripAnsi(raw));
		},
	};
}

async function arm(
	name: string,
	rep: number,
	opts: { peer: string; graceful?: boolean }
) {
	const registry = await fs.realpath(await fs.mkdtemp(tmpPathBase));
	onTestFinished(async () => {
		await fs.rm(registry, { recursive: true, maxRetries: 10 });
	});

	let t0 = Date.now();
	const victim = spawnMerged(VICTIM, registry, () => Date.now() - t0);
	if (!(await victim.ready())) {
		throw new Error("victim never became ready");
	}
	t0 = Date.now();

	let atMs: number | null = null;
	let watching = true;
	const watcher = (async () => {
		while (watching) {
			if (atMs === null && CRASH.test(victim.log())) {
				atMs = Date.now() - t0;
			}
			await new Promise((r) => setTimeout(r, 200));
		}
	})();

	let cycles = 0;
	let cleanExits = 0;
	try {
		while (Date.now() < t0 + OBSERVE_MS) {
			const peer = spawnMerged(opts.peer, registry, () => 0);
			await peer.ready();
			cycles++;
			await new Promise((r) => setTimeout(r, 2000));

			if (opts.graceful) {
				peer.requestStop();
				// A graceful stop that silently fails would leave the peer alive and
				// make this arm look clean for the wrong reason, so verify, and only
				// then escalate.
				if (await peer.waitForExit(10_000)) {
					cleanExits++;
				} else {
					await peer.force();
				}
			} else {
				await peer.force();
			}
			await new Promise((r) => setTimeout(r, 1000));
		}
	} finally {
		watching = false;
		await watcher;
	}

	const log = victim.log();
	results.push({ arm: name, rep, atMs, cycles, cleanExits });
	console.log(
		`[${name}#${rep}] victim=${
			atMs === null ? "ok" : `CRASHED at +${atMs}ms`
		} cycles=${cycles} cleanExits=${cleanExits} restarts=${
			(log.match(/server restarted/g) ?? []).length
		}`
	);

	if (atMs !== null && dumped < 2) {
		dumped++;
		const lines = log.split("\n");
		const i = lines.findIndex((l) => CRASH.test(l));
		console.log(`::group::[VICTIM LOG] ${name}#${rep}`);
		console.log(lines.slice(Math.max(0, i - 18), i + 4).join("\n"));
		console.log("::endgroup::");
	}
}

describe.sequential("crash bisect round 8: how the peer dies", () => {
	afterAll(() => {
		console.log("\n::group::[BISECT SUMMARY]");
		for (const a of [...new Set(results.map((r) => r.arm))]) {
			const rows = results.filter((r) => r.arm === a);
			const hits = rows.filter((r) => r.atMs !== null);
			const cycles = rows.reduce((n, r) => n + r.cycles, 0);
			const clean = rows.reduce((n, r) => n + r.cleanExits, 0);
			console.log(
				`  ${a.padEnd(24)} crashed ${hits.length}/${rows.length}  ` +
					`cycles=${cycles} cleanExits=${clean}` +
					(hits.length
						? `  at=[${hits.map((h) => `+${h.atMs}ms`).join(", ")}]`
						: "")
			);
		}
		console.log("::endgroup::");
	});

	for (let rep = 1; rep <= REPS; rep++) {
		test(`epsilon forceful kill #${rep}`, async () => {
			await arm("epsilon force", rep, { peer: PEER });
		});

		// Controls only need enough reps to stay comparable with round 8.
		if (rep <= 3) {
			test(`eta peer without assets #${rep}`, async () => {
				await arm("eta no-assets peer", rep, { peer: PEER_NO_ASSETS });
			});

			test(`theta unrelated peer #${rep}`, async () => {
				await arm("theta unrelated peer", rep, { peer: PEER_UNRELATED });
			});
		}
	}
});
