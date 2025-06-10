import { readdirSync } from "fs";
import { spinner } from "@cloudflare/cli/interactive";
import { expect, vi } from "vitest";
import whichPMRuns from "which-pm-runs";
import type { Dirent } from "fs";

export const mockPackageManager = (name: string, version = "1.0.0") => {
	if (!vi.isMockFunction(whichPMRuns)) {
		expect.fail(
			"When using `mockPackageManager` you must first call: vi.mock('which-pm-runs');",
		);
	}
	vi.mocked(whichPMRuns).mockReturnValue({ name, version });
};

export const mockWorkersTypesDirectory = (
	mockImpl: () => string[] = () => [...mockWorkersTypesDirListing],
) => {
	if (!vi.isMockFunction(readdirSync)) {
		expect.fail(
			"When using `mockWorkersTypesDirectory` you must first call: vi.mock('fs');",
		);
	}
	vi.mocked(readdirSync).mockImplementation((path) => {
		if (path.toString().match("workers-types")) {
			// vitest won't resolve the type for the correct `readdirSync` overload thus the trickery
			return mockImpl() as unknown as Dirent[];
		}
		return [];
	});
};

export const mockSpinner = () => {
	if (!vi.isMockFunction(spinner)) {
		expect.fail(
			"When using `mockPackageManager` you must first call: vi.mock('@cloudflare/cli/interactive');",
		);
	}

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
