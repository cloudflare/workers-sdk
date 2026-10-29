import { prepareContainerImagesForDev } from "@cloudflare/containers-shared";
import { beforeEach, describe, it, vi } from "vitest";
import { LocalRuntimeController } from "../../../api/startDevWorker/LocalRuntimeController";
import { FakeBus } from "../../helpers/fake-bus";
import { mockConsoleMethods } from "../../helpers/mock-console";
import { unusable } from "../../helpers/unusable";
import type { BundleCompleteEvent } from "../../../api/startDevWorker/events";
import type { ContainerImagePreparationState } from "../../../api/startDevWorker/LocalRuntimeController";
import type { StartDevWorkerOptions } from "../../../api/startDevWorker/types";
import type { ContainerDevPlan } from "@cloudflare/containers-shared";

vi.mock("@cloudflare/containers-shared", async (importOriginal) => {
	const original =
		await importOriginal<typeof import("@cloudflare/containers-shared")>();
	return { ...original, prepareContainerImagesForDev: vi.fn() };
});

class TestRuntimeController extends LocalRuntimeController {
	prepare(
		data: BundleCompleteEvent,
		previousState?: ContainerImagePreparationState
	) {
		return this.prepareContainerImages(data, previousState);
	}
}

function imageFreePlan(): ContainerDevPlan {
	return {
		containerOptions: [],
		containerRuntimeOptions: new Map([["Probe", {}]]),
	};
}

function event(
	plan: ContainerDevPlan | undefined = imageFreePlan(),
	enabled = true
): BundleCompleteEvent {
	return {
		type: "bundleComplete",
		bundle: unusable<BundleCompleteEvent["bundle"]>(),
		config: {
			name: "test-worker",
			compatibilityDate: "2026-09-21",
			complianceRegion: undefined,
			entrypoint: "NOT_REAL",
			projectRoot: "NOT_REAL",
			build: unusable<StartDevWorkerOptions["build"]>(),
			legacy: {},
			containerDevPlan: plan,
			dev: {
				persist: false,
				remote: false,
				enableContainers: enabled,
				dockerPath: "test-docker",
			},
		},
	};
}

describe("Container image preparation", () => {
	mockConsoleMethods();
	let controller: TestRuntimeController;

	beforeEach(() => {
		controller = new TestRuntimeController(new FakeBus());
		vi.mocked(prepareContainerImagesForDev).mockReset();
		vi.mocked(prepareContainerImagesForDev).mockResolvedValue({
			aborted: false,
		});
	});

	it("prepares the sidecar without application images or a build ID", async ({
		expect,
	}) => {
		await controller.prepare(event());
		expect(prepareContainerImagesForDev).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				dockerPath: "test-docker",
				containerOptions: [],
			})
		);
		expect(controller.containerImageTagsSeen.size).toBe(0);
	});

	it.for(["disabled", "absent"])(
		"skips preparation when Containers are %s",
		async (mode, { expect }) => {
			const data = event(imageFreePlan(), mode !== "disabled");
			if (mode === "absent") {
				data.config.containerDevPlan = undefined;
			}
			await controller.prepare(data);
			expect(prepareContainerImagesForDev).not.toHaveBeenCalled();
		}
	);

	it("deduplicates reloads and prepares after Containers are enabled or added", async ({
		expect,
	}) => {
		const data = event(imageFreePlan(), false);
		let state = await controller.prepare(data);
		data.config.dev.enableContainers = true;
		state = await controller.prepare(data, state);
		state = await controller.prepare(event(), state);
		expect(prepareContainerImagesForDev).toHaveBeenCalledTimes(1);

		data.config.containerDevPlan = undefined;
		state = await controller.prepare(data, state);
		await controller.prepare(event(), state);
		expect(prepareContainerImagesForDev).toHaveBeenCalledTimes(2);
	});

	it("retries failed sidecar preparation without caching success", async ({
		expect,
	}) => {
		const previousState = await controller.prepare(
			event(imageFreePlan(), false)
		);
		vi.mocked(prepareContainerImagesForDev).mockRejectedValueOnce(
			new Error("pull failed")
		);
		await expect(controller.prepare(event(), previousState)).rejects.toThrow(
			"pull failed"
		);
		await controller.prepare(event(), previousState);
		expect(prepareContainerImagesForDev).toHaveBeenCalledTimes(2);
	});

	it("preserves the previous state after aborted preparation and retries", async ({
		expect,
	}) => {
		const previousState = await controller.prepare(
			event(imageFreePlan(), false)
		);
		vi.mocked(prepareContainerImagesForDev).mockResolvedValueOnce({
			aborted: true,
		});
		const state = await controller.prepare(event(), previousState);
		expect(state).toBe(previousState);
		await controller.prepare(event(), state);
		expect(prepareContainerImagesForDev).toHaveBeenCalledTimes(2);
	});

	it("still prepares and tracks configured images", async ({ expect }) => {
		const plan = imageFreePlan();
		plan.containerOptions.push({
			class_name: "Probe",
			image_uri: "docker.io/library/alpine:3.19",
			image_tag: "cloudflare-dev/probe:test",
		});
		const data = event(plan);
		data.config.dev.containerBuildId = "test";
		await controller.prepare(data);
		expect(prepareContainerImagesForDev).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ containerOptions: plan.containerOptions })
		);
		expect(controller.containerImageTagsSeen).toEqual(
			new Set(["cloudflare-dev/probe:test"])
		);
	});
});
