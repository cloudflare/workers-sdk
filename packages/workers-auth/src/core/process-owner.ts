import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const OWNER_PATTERN =
	/^owner-([1-9]\d*)-(?:([\da-f]{16}|unknown)-)?[\da-f-]{36}$/;
const IDENTITY_CACHE_TTL_MS = 5_000;
const MAX_CACHED_OWNERS = 128;

let ownIdentity: string | undefined;
let checkedOwnIdentity = false;

function processIdentity(pid: number): string | undefined {
	if (pid !== process.pid) {
		return probeProcessIdentity(pid);
	}
	if (!checkedOwnIdentity) {
		ownIdentity = probeProcessIdentity(pid);
		checkedOwnIdentity = true;
	}
	return ownIdentity;
}

function probeProcessIdentity(pid: number): string | undefined {
	try {
		let identity: string;
		if (process.platform === "linux") {
			const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
			const start = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
			if (!start) {
				return undefined;
			}
			identity =
				readFileSync("/proc/sys/kernel/random/boot_id", "utf8") + start;
		} else if (process.platform === "darwin") {
			identity = execFileSync("/bin/ps", ["-p", String(pid), "-o", "lstart="], {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
				timeout: 1_000,
				env: { ...process.env, LC_ALL: "C", TZ: "UTC" },
			}).trim();
		} else if (process.platform === "win32") {
			identity = execFileSync(
				"powershell.exe",
				[
					"-NoProfile",
					"-NonInteractive",
					"-Command",
					"(Get-Process -Id $env:WORKERS_AUTH_LOCK_PID -ErrorAction Stop).StartTime.ToUniversalTime().Ticks",
				],
				{
					encoding: "utf8",
					stdio: ["ignore", "pipe", "ignore"],
					timeout: 2_000,
					windowsHide: true,
					env: { ...process.env, WORKERS_AUTH_LOCK_PID: String(pid) },
				}
			).trim();
		} else {
			return undefined;
		}
		return identity
			? createHash("sha256").update(identity).digest("hex").slice(0, 16)
			: undefined;
	} catch {
		return undefined;
	}
}

/** Recognize both current and older lock ownership records. */
export function isProcessOwner(owner: string): boolean {
	return OWNER_PATTERN.test(owner);
}

/** Share the current process identity while caching other owners per instance. */
export class ProcessOwnerChecker {
	private readonly checkedOwners = new Map<string, number>();

	/** Identify an owner by PID and process start, without storing secrets. */
	createOwner(): string {
		return `owner-${process.pid}-${processIdentity(process.pid) ?? "unknown"}-${randomUUID()}`;
	}

	/** Treat uncertain liveness as alive; reclaim only proven abandoned owners. */
	isAlive(owner: string): boolean {
		const match = OWNER_PATTERN.exec(owner);
		if (!match) {
			return true;
		}
		const pid = Number(match[1]);
		try {
			process.kill(pid, 0);
		} catch (error) {
			const exited =
				error instanceof Error && "code" in error && error.code === "ESRCH";
			if (exited) {
				this.checkedOwners.delete(owner);
			}
			return !exited;
		}
		const recordedIdentity = match[2];
		if (!recordedIdentity || recordedIdentity === "unknown") {
			return true;
		}
		const checkedAt = this.checkedOwners.get(owner);
		if (
			checkedAt !== undefined &&
			performance.now() - checkedAt < IDENTITY_CACHE_TTL_MS
		) {
			return true;
		}
		const currentIdentity = processIdentity(pid);
		if (currentIdentity !== undefined && currentIdentity !== recordedIdentity) {
			this.checkedOwners.delete(owner);
			return false;
		}
		this.checkedOwners.delete(owner);
		if (this.checkedOwners.size >= MAX_CACHED_OWNERS) {
			const oldestOwner = this.checkedOwners.keys().next().value;
			if (oldestOwner !== undefined) {
				this.checkedOwners.delete(oldestOwner);
			}
		}
		this.checkedOwners.set(owner, performance.now());
		return true;
	}
}
