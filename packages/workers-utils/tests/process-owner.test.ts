import childProcess from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { afterEach, describe, it, vi } from "vitest";
import { ProcessOwnerChecker } from "../src/fs/process-owner";

function mockProcessStartIdentity(pid = process.pid + 1) {
	const probe = vi.fn(() => "1");
	vi.spyOn(process, "kill").mockReturnValue(true);
	if (process.platform === "linux") {
		const read = fs.readFileSync;
		vi.spyOn(fs, "readFileSync").mockImplementation((...args) => {
			if (String(args[0]) === `/proc/${pid}/stat`) {
				return `${pid} (process name) ${Array.from({ length: 19 }, () => "1").join(" ")} ${probe()}`;
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
		owner: `owner-${pid}-${identity}-${randomUUID()}`,
	};
}

describe("filesystem process ownership", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		syncBuiltinESMExports();
	});

	it("recognizes its own process start identity", ({ expect }) => {
		const owners = new ProcessOwnerChecker();
		expect(owners.isAlive(owners.createOwner())).toBe(true);
	});

	it("reclaims a reused PID only when its process-start identity changed", ({
		expect,
	}) => {
		const owners = new ProcessOwnerChecker();
		const { probe, owner } = mockProcessStartIdentity();
		probe.mockReturnValue("2");
		expect(owners.isAlive(owner)).toBe(false);
	});

	it("keeps ownership when process-start identity cannot be inspected", ({
		expect,
	}) => {
		const owners = new ProcessOwnerChecker();
		const { probe, owner } = mockProcessStartIdentity();
		probe.mockImplementation(() => {
			throw new Error("denied");
		});
		expect(owners.isAlive(owner)).toBe(true);
	});

	it("caches identity probes for five seconds but checks PID liveness on every poll", ({
		expect,
	}) => {
		const owners = new ProcessOwnerChecker();
		const { probe, owner } = mockProcessStartIdentity();
		const kill = vi.spyOn(process, "kill").mockReturnValue(true);
		const now = vi.spyOn(performance, "now").mockReturnValue(0);

		expect(owners.isAlive(owner)).toBe(true);
		now.mockReturnValue(100);
		expect(owners.isAlive(owner)).toBe(true);
		now.mockReturnValue(4_999);
		expect(owners.isAlive(owner)).toBe(true);
		expect(probe).toHaveBeenCalledOnce();
		expect(kill).toHaveBeenCalledTimes(3);

		probe.mockReturnValue("2");
		now.mockReturnValue(5_000);
		expect(owners.isAlive(owner)).toBe(false);
		expect(probe).toHaveBeenCalledTimes(2);
		expect(kill).toHaveBeenCalledTimes(4);
	});

	it("detects process exit immediately despite a cached identity", ({
		expect,
	}) => {
		const owners = new ProcessOwnerChecker();
		const { probe, owner } = mockProcessStartIdentity();
		const kill = vi.spyOn(process, "kill").mockReturnValue(true);
		vi.spyOn(performance, "now").mockReturnValue(0);
		expect(owners.isAlive(owner)).toBe(true);

		kill.mockImplementationOnce(() => {
			throw Object.assign(new Error("exited"), { code: "ESRCH" });
		});
		expect(owners.isAlive(owner)).toBe(false);
		expect(probe).toHaveBeenCalledOnce();

		probe.mockReturnValue("2");
		expect(owners.isAlive(owner)).toBe(false);
		expect(probe).toHaveBeenCalledTimes(2);
	});

	it("throttles failed identity probes without evicting uncertain owners", ({
		expect,
	}) => {
		const owners = new ProcessOwnerChecker();
		const { probe, owner } = mockProcessStartIdentity();
		const now = vi.spyOn(performance, "now").mockReturnValue(0);
		probe.mockImplementationOnce(() => {
			throw new Error("denied");
		});
		expect(owners.isAlive(owner)).toBe(true);
		now.mockReturnValue(100);
		expect(owners.isAlive(owner)).toBe(true);
		expect(probe).toHaveBeenCalledOnce();

		probe.mockReturnValue("2");
		now.mockReturnValue(5_000);
		expect(owners.isAlive(owner)).toBe(false);
		expect(probe).toHaveBeenCalledTimes(2);
	});

	it("does not share cached checks between different ownership records", ({
		expect,
	}) => {
		const owners = new ProcessOwnerChecker();
		const { probe, owner } = mockProcessStartIdentity();
		vi.spyOn(performance, "now").mockReturnValue(0);
		expect(owners.isAlive(owner)).toBe(true);
		expect(owners.isAlive(owner.slice(0, -36) + randomUUID())).toBe(true);
		expect(probe).toHaveBeenCalledTimes(2);
	});

	it("bounds cached ownership checks instead of retaining every prior owner", ({
		expect,
	}) => {
		const owners = new ProcessOwnerChecker();
		const { probe, owner } = mockProcessStartIdentity();
		vi.spyOn(performance, "now").mockReturnValue(0);
		expect(owners.isAlive(owner)).toBe(true);
		for (let index = 0; index < 128; index++) {
			expect(owners.isAlive(owner.slice(0, -36) + randomUUID())).toBe(true);
		}
		expect(owners.isAlive(owner)).toBe(true);
		expect(probe).toHaveBeenCalledTimes(130);
	});

	it("keeps cached ownership checks private to each checker", ({ expect }) => {
		const { probe, owner } = mockProcessStartIdentity();
		const first = new ProcessOwnerChecker();
		const second = new ProcessOwnerChecker();
		expect(first.isAlive(owner)).toBe(true);
		expect(first.isAlive(owner)).toBe(true);
		expect(probe).toHaveBeenCalledOnce();
		expect(second.isAlive(owner)).toBe(true);
		expect(probe).toHaveBeenCalledTimes(2);
	});

	it("lazily caches its own process identity within its checker", ({
		expect,
	}) => {
		const { probe, owner } = mockProcessStartIdentity(process.pid);
		const owners = new ProcessOwnerChecker();
		const now = vi.spyOn(performance, "now").mockReturnValue(0);
		expect(probe).not.toHaveBeenCalled();
		const firstOwner = owners.createOwner();
		const secondOwner = owners.createOwner();
		expect(firstOwner.slice(0, -36)).toBe(owner.slice(0, -36));
		expect(secondOwner.slice(0, -36)).toBe(owner.slice(0, -36));
		expect(firstOwner).not.toBe(secondOwner);
		expect(firstOwner).not.toBe(owners.createOwner());
		expect(owners.isAlive(secondOwner)).toBe(true);
		expect(owners.isAlive(firstOwner)).toBe(true);
		now.mockReturnValue(5_000);
		expect(owners.isAlive(secondOwner)).toBe(true);
		expect(
			owners.isAlive(`owner-${process.pid}-${"0".repeat(16)}-${randomUUID()}`)
		).toBe(false);
		expect(probe).toHaveBeenCalledOnce();
	});

	it("keeps its own process identity private to each checker", ({ expect }) => {
		const { probe } = mockProcessStartIdentity(process.pid);
		const first = new ProcessOwnerChecker();
		const second = new ProcessOwnerChecker();
		const firstOwner = first.createOwner();
		probe.mockReturnValue("2");
		const secondOwner = second.createOwner();
		expect(firstOwner.slice(0, -36)).not.toBe(secondOwner.slice(0, -36));
		expect(first.createOwner().slice(0, -36)).toBe(firstOwner.slice(0, -36));
		expect(second.createOwner().slice(0, -36)).toBe(secondOwner.slice(0, -36));
		expect(first.isAlive(secondOwner)).toBe(false);
		expect(second.isAlive(firstOwner)).toBe(false);
		expect(probe).toHaveBeenCalledTimes(2);
	});

	it("caches a failed own-process probe only within its owning checker", ({
		expect,
	}) => {
		const { probe, owner } = mockProcessStartIdentity(process.pid);
		probe.mockImplementationOnce(() => {
			throw new Error("denied");
		});
		const owners = new ProcessOwnerChecker();
		const firstOwner = owners.createOwner();
		const secondOwner = owners.createOwner();
		expect(firstOwner).toContain(`owner-${process.pid}-unknown-`);
		expect(secondOwner).toContain(`owner-${process.pid}-unknown-`);
		expect(firstOwner).not.toBe(secondOwner);
		expect(owners.isAlive(owner)).toBe(true);
		expect(owners.isAlive(owner)).toBe(true);
		expect(probe).toHaveBeenCalledOnce();
		const separateOwners = new ProcessOwnerChecker();
		expect(separateOwners.createOwner().slice(0, -36)).toBe(
			owner.slice(0, -36)
		);
		expect(probe).toHaveBeenCalledTimes(2);
	});
});
