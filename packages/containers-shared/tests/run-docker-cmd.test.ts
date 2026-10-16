import { afterEach, describe, it, vi } from "vitest";
import { runDockerCmdWithOutput } from "../src/utils";

// A real subprocess stands in for a Docker CLI that cannot reach its daemon,
// so the test observes what Node writes to this process's stderr.
const unreachableDaemonArgs = [
	"-e",
	"process.stderr.write('Cannot connect to the Docker daemon'); process.exit(1)",
];

describe("runDockerCmdWithOutput", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("keeps a failed command's stderr out of the terminal and in the error", ({
		expect,
	}) => {
		const stderrWrite = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);

		expect(() =>
			runDockerCmdWithOutput(process.execPath, unreachableDaemonArgs)
		).toThrow("Cannot connect to the Docker daemon");
		expect(stderrWrite).not.toHaveBeenCalled();
	});
});
