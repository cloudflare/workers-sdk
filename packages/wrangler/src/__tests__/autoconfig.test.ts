import { FatalError } from "@cloudflare/workers-utils";
import { vi } from "vitest";
import * as details from "../autoconfig/get-details";
import * as run from "../autoconfig/run";
import * as format from "../deployment-bundle/guess-worker-format";
import { clearOutputFilePath } from "../output";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { clearDialogs } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWorkerSource } from "./helpers/write-worker-source";
import { writeWranglerConfig } from "./helpers/write-wrangler-config";

vi.mock("../deploy/deploy", async (importOriginal) => ({
	...(await importOriginal()),
	default: () => {
		// In unit tests of autoconfig we only care about the configuration aspect, so bail before any actual deployment happens
		throw new FatalError("Bailing early in tests");
	},
}));

async function runDeploy(withArgs: string = "") {
	// Expect "Bailing early in tests" to be thrown
	await expect(runWrangler(`deploy ${withArgs}`)).rejects.toThrowError();
}

// We don't care about module/service worker detection in the autoconfig tests,
// and mocking it out speeds up the tests by removing an esbuild invocation
vi.spyOn(format, "guessWorkerFormat").mockImplementation(() =>
	Promise.resolve({
		format: "modules",
		exports: [],
	})
);

describe("autoconfig (deploy)", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		setIsTTY(true);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		clearDialogs();
		clearOutputFilePath();
	});

	it("should not check for autoconfig without flag", async () => {
		writeWorkerSource();
		writeWranglerConfig({ main: "index.js" });
		const getDetailsSpy = vi.spyOn(details, "getDetailsForAutoConfig");
		await runDeploy();

		expect(getDetailsSpy).not.toHaveBeenCalled();
	});

	it("should check for autoconfig with flag", async () => {
		const getDetailsSpy = vi.spyOn(details, "getDetailsForAutoConfig");

		await runDeploy("--x-autoconfig");

		expect(getDetailsSpy).toHaveBeenCalled();
	});

	it("should run autoconfig if project is not configured", async () => {
		const getDetailsSpy = vi
			.spyOn(details, "getDetailsForAutoConfig")
			.mockImplementationOnce(() => Promise.resolve({ configured: false }));
		const runSpy = vi.spyOn(run, "runAutoConfig");

		await runDeploy("--x-autoconfig");

		expect(getDetailsSpy).toHaveBeenCalled();
		expect(runSpy).toHaveBeenCalled();
	});

	it("should not run autoconfig if project is already configured", async () => {
		const getDetailsSpy = vi
			.spyOn(details, "getDetailsForAutoConfig")
			.mockImplementationOnce(() => Promise.resolve({ configured: true }));
		const runSpy = vi.spyOn(run, "runAutoConfig");

		await runDeploy("--x-autoconfig");

		expect(getDetailsSpy).toHaveBeenCalled();
		expect(runSpy).not.toHaveBeenCalled();
	});
});
