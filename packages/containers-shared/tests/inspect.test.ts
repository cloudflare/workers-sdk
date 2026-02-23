import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", async () => {
	return {
		spawn: vi.fn(),
	};
});

const getSpawnMock = async () => {
	const mod = await import("node:child_process");
	return mod.spawn as unknown as ReturnType<typeof vi.fn>;
};

const createMockProc = (
	stdoutText: string,
	stderrText: string,
	exitCode: number
) => {
	const proc = new EventEmitter() as any;
	proc.stdout = new EventEmitter();
	proc.stderr = new EventEmitter();

	setTimeout(() => {
		if (stderrText) {
			proc.stderr.emit("data", Buffer.from(stderrText));
		}
		if (stdoutText) {
			proc.stdout.emit("data", Buffer.from(stdoutText));
		}
		proc.emit("close", exitCode);
	}, 0);

	return proc;
};

describe("dockerImageInspect", () => {
	it("retries on transient missing-image errors and eventually resolves", async () => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		const spawn = await getSpawnMock();

		let call = 0;
		spawn.mockImplementation(() => {
			call++;
			if (call <= 2) {
				return createMockProc(
					"",
					"Error response from daemon: No such image: cloudflare-dev/test:deadbeef",
					1
				);
			}
			return createMockProc("42\n", "", 0);
		});

		const { dockerImageInspect } = await import("../src/inspect");

		const promise = dockerImageInspect("docker", {
			imageTag: "cloudflare-dev/test:deadbeef",
			formatString: "{{ .Id }}",
		});
		const assertion = expect(promise).resolves.toBe("42");

		await vi.runAllTimersAsync();
		await assertion;
		expect(spawn).toHaveBeenCalledTimes(3);
	});

	it("does not retry on non-transient inspect failures", async () => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		const spawn = await getSpawnMock();
		spawn.mockImplementation(() => {
			return createMockProc("", "permission denied", 1);
		});

		const { dockerImageInspect } = await import("../src/inspect");

		const promise = dockerImageInspect("docker", {
			imageTag: "cloudflare-dev/test:deadbeef",
			formatString: "{{ .Id }}",
		});
		const assertion = expect(promise).rejects.toThrow(
			/failed inspecting image locally/i
		);

		await vi.runAllTimersAsync();
		await assertion;
		expect(spawn).toHaveBeenCalledTimes(1);
	});
});
