import childProcess from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { afterEach, describe, it, vi } from "vitest";
import {
	createProcessOwner,
	isProcessOwnerAlive,
} from "../src/core/process-owner";

function mockProcessStartIdentity() {
	const probe = vi.fn(() => "1");
	if (process.platform === "linux") {
		const read = fs.readFileSync;
		vi.spyOn(fs, "readFileSync").mockImplementation((...args) => {
			if (String(args[0]) === `/proc/${process.pid}/stat`) {
				return `1 (process) ${Array.from({ length: 19 }, () => "1").join(" ")} ${probe()}`;
			}
			if (String(args[0]) === "/proc/sys/kernel/random/boot_id") {
				return "boot-id";
			}
			return read(...args);
		});
	} else {
		vi.spyOn(childProcess, "execFileSync").mockImplementation(() => probe());
	}
	syncBuiltinESMExports();
	const identity = createHash("sha256")
		.update(process.platform === "linux" ? "boot-id1" : "1")
		.digest("hex")
		.slice(0, 16);
	return {
		probe,
		owner: `owner-${process.pid}-${identity}-${randomUUID()}`,
	};
}

describe("credential process ownership", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		syncBuiltinESMExports();
	});

	it("recognizes its own process start identity", ({ expect }) => {
		expect(isProcessOwnerAlive(createProcessOwner())).toBe(true);
	});

	it("reclaims a reused PID only when its process-start identity changed", ({
		expect,
	}) => {
		const owner = `owner-${process.pid}-${"0".repeat(16)}-${randomUUID()}`;
		if (process.platform === "linux") {
			const read = fs.readFileSync;
			vi.spyOn(fs, "readFileSync").mockImplementation((...args) => {
				if (String(args[0]) === `/proc/${process.pid}/stat`) {
					return `1 (other process) ${Array.from({ length: 20 }, () => "1").join(" ")}`;
				}
				return read(...args);
			});
		} else {
			vi.spyOn(childProcess, "execFileSync").mockReturnValue(
				"different start time"
			);
		}
		syncBuiltinESMExports();
		expect(isProcessOwnerAlive(owner)).toBe(false);
	});

	it("keeps ownership when process-start identity cannot be inspected", ({
		expect,
	}) => {
		const owner = createProcessOwner();
		vi.spyOn(childProcess, "execFileSync").mockImplementation(() => {
			throw new Error("denied");
		});
		vi.spyOn(fs, "readFileSync").mockImplementation(() => {
			throw new Error("denied");
		});
		syncBuiltinESMExports();
		expect(isProcessOwnerAlive(owner)).toBe(true);
	});

	it("caches identity probes for five seconds but checks PID liveness on every poll", ({
		expect,
	}) => {
		const { probe, owner } = mockProcessStartIdentity();
		const kill = vi.spyOn(process, "kill").mockReturnValue(true);
		const now = vi.spyOn(performance, "now").mockReturnValue(0);

		expect(isProcessOwnerAlive(owner)).toBe(true);
		now.mockReturnValue(100);
		expect(isProcessOwnerAlive(owner)).toBe(true);
		now.mockReturnValue(4_999);
		expect(isProcessOwnerAlive(owner)).toBe(true);
		expect(probe).toHaveBeenCalledOnce();
		expect(kill).toHaveBeenCalledTimes(3);

		probe.mockReturnValue("2");
		now.mockReturnValue(5_000);
		expect(isProcessOwnerAlive(owner)).toBe(false);
		expect(probe).toHaveBeenCalledTimes(2);
		expect(kill).toHaveBeenCalledTimes(4);
	});

	it("detects process exit immediately despite a cached identity", ({
		expect,
	}) => {
		const { probe, owner } = mockProcessStartIdentity();
		const kill = vi.spyOn(process, "kill").mockReturnValue(true);
		vi.spyOn(performance, "now").mockReturnValue(0);
		expect(isProcessOwnerAlive(owner)).toBe(true);

		kill.mockImplementationOnce(() => {
			throw Object.assign(new Error("exited"), { code: "ESRCH" });
		});
		expect(isProcessOwnerAlive(owner)).toBe(false);
		expect(probe).toHaveBeenCalledOnce();

		probe.mockReturnValue("2");
		expect(isProcessOwnerAlive(owner)).toBe(false);
		expect(probe).toHaveBeenCalledTimes(2);
	});

	it("throttles failed identity probes without evicting uncertain owners", ({
		expect,
	}) => {
		const { probe, owner } = mockProcessStartIdentity();
		const now = vi.spyOn(performance, "now").mockReturnValue(0);
		probe.mockImplementationOnce(() => {
			throw new Error("denied");
		});
		expect(isProcessOwnerAlive(owner)).toBe(true);
		now.mockReturnValue(100);
		expect(isProcessOwnerAlive(owner)).toBe(true);
		expect(probe).toHaveBeenCalledOnce();

		probe.mockReturnValue("2");
		now.mockReturnValue(5_000);
		expect(isProcessOwnerAlive(owner)).toBe(false);
		expect(probe).toHaveBeenCalledTimes(2);
	});

	it("does not share cached checks between different ownership records", ({
		expect,
	}) => {
		const { probe, owner } = mockProcessStartIdentity();
		vi.spyOn(performance, "now").mockReturnValue(0);
		expect(isProcessOwnerAlive(owner)).toBe(true);
		expect(isProcessOwnerAlive(owner.slice(0, -36) + randomUUID())).toBe(true);
		expect(probe).toHaveBeenCalledTimes(2);
	});

	it("bounds cached ownership checks instead of retaining every prior owner", ({
		expect,
	}) => {
		const { probe, owner } = mockProcessStartIdentity();
		vi.spyOn(performance, "now").mockReturnValue(0);
		expect(isProcessOwnerAlive(owner)).toBe(true);
		for (let index = 0; index < 128; index++) {
			expect(isProcessOwnerAlive(owner.slice(0, -36) + randomUUID())).toBe(
				true
			);
		}
		expect(isProcessOwnerAlive(owner)).toBe(true);
		expect(probe).toHaveBeenCalledTimes(130);
	});
});
