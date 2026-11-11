import childProcess from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { afterEach, describe, it, vi } from "vitest";
import {
	createProcessOwner,
	isProcessOwnerAlive,
} from "../src/core/process-owner";

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
});
