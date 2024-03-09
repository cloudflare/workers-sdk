import { readdirSync } from "fs";
import { spinner } from "@cloudflare/cli/interactive";
import { runCommand } from "helpers/command";
import { vi } from "vitest";
import whichPMRuns from "which-pm-runs";
import type { Dirent } from "fs";
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

// Requires the `fs` module to be mocked in the test file like so:
//    vi.mock("fs");
export const mockWorkersTypesDirectory = (
	mockImpl: () => string[] = () => [...mockWorkersTypesDirListing]
) => {
	vi.mocked(readdirSync).mockImplementation((path) => {
		if (path.toString().match("workers-types")) {
			// vitest won't resolve the type for the correct `readdirSync` overload thus the trickery
			return mockImpl() as unknown as Dirent[];
		}
		return [];
	});
};

export const mockSpinner = () => {
	const start = vi.fn();
	const update = vi.fn();
	const stop = vi.fn();

	vi.mocked(spinner).mockImplementation(() => ({
		start,
		stop,
		update,
	}));

	return {
		start,
		stop,
		update,
	};
};

const mockWorkersTypesDirListing = [
	"2021-11-03",
	"2022-03-21",
	"2022-11-30",
	"2023-03-01",
	"2023-07-01",
	"experimental",
	"index.d.ts",
	"index.ts",
	"oldest",
	"package.json",
];
