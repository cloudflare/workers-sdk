// import { runCommand } from "helpers/command";
import { runCommand } from "helpers/command";
import { vi } from "vitest";
import whichPMRuns from "which-pm-runs";
import type { PmName } from "helpers/packageManagers";

// Requires the `helpers/command` module to be mocked in the test file like so:
//    vi.mock("helpers/command");
export const mockRunCommand = (mockedReturnValue = "") => {
	const mock = vi
		.mocked(runCommand)
		.mockImplementation(() => Promise.resolve(mockedReturnValue));

	return {
		mock,
		getCalls: () => mock.mock.calls,
	};
};

// Requires the `which-pm-runs` module to be mocked in the test file like so:
//    vi.mock("which-pm-runs");
export const mockPackageManager = (name: PmName, version = "1.0.0") => {
	vi.mocked(whichPMRuns).mockReturnValue({ name, version });
};
