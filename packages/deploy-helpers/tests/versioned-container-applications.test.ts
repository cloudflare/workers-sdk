import { describe, it } from "vitest";
import { getVersionedDurableObjectContainerApplications } from "../src/deploy/helpers/durable-object-container-applications";
import type { ApiVersion } from "../src/deploy/helpers/versions-types";
import type {
	CfWorkerInit,
	WorkerMetadataBinding,
} from "@cloudflare/workers-utils";

function version(
	containers: CfWorkerInit["containers"],
	bindings: WorkerMetadataBinding[] = []
): ApiVersion {
	return {
		id: "version",
		number: 1,
		metadata: {
			created_on: "",
			modified_on: "",
			source: "api",
			author_id: "",
			author_email: "",
		},
		resources: {
			bindings,
			script: { etag: "", handlers: [], last_deployed_from: "api" },
			script_runtime: { usage_model: "standard", limits: {}, containers },
		},
	};
}

const identity = { name: "sandbox", class_name: "Sandbox" };
const images = {
	app: "registry.cloudflare.com/account/app@sha256:" + "a".repeat(64),
};

describe("versioned Container applications from native images", () => {
	it("identifies managed classes among scheduler and image-less containers", ({
		expect,
	}) => {
		expect(
			getVersionedDurableObjectContainerApplications(
				[
					version([
						{ name: "scheduler", class_name: "Scheduled" },
						{ ...identity, images },
						{ name: "existing", class_name: "Existing" },
					]),
				],
				"worker"
			)
		).toEqual([{ ...identity, namespaceId: undefined }]);
	});

	it.for([undefined, {}])(
		"does not provision containers with images %j from a version",
		(emptyImages, { expect }) => {
			expect(
				getVersionedDurableObjectContainerApplications(
					[
						version(
							[{ ...identity, images: emptyImages }],
							[
								{
									type: "json",
									name: "EXPERIMENTAL_CLOUDFLARE_CONTAINER_IMAGES",
									json: { Sandbox: {} },
								},
							]
						),
					],
					"worker"
				)
			).toEqual([]);
		}
	);

	it.for([undefined, []])(
		"ignores bindings when native containers are %j",
		(containers, { expect }) => {
			expect(
				getVersionedDurableObjectContainerApplications(
					[
						version(containers, [
							{
								type: "json",
								name: "EXPERIMENTAL_CLOUDFLARE_CONTAINER_IMAGES",
								json: 42,
							},
						]),
					],
					"worker"
				)
			).toEqual([]);
		}
	);

	it("allows different images across versions", ({ expect }) => {
		expect(
			getVersionedDurableObjectContainerApplications(
				[
					version([{ ...identity, images }]),
					version([
						{
							...identity,
							images: {
								tool:
									"registry.cloudflare.com/account/tool@sha256:" +
									"b".repeat(64),
							},
						},
					]),
				],
				"worker"
			)
		).toEqual([{ ...identity, namespaceId: undefined }]);
	});

	it.for([false, true])(
		"allows adding or removing named images (reverse order: %j)",
		(reverse, { expect }) => {
			const versions = [
				version([{ ...identity, images }]),
				version([identity]),
			];
			expect(
				getVersionedDurableObjectContainerApplications(
					reverse ? versions.reverse() : versions,
					"worker"
				)
			).toEqual([{ ...identity, namespaceId: undefined }]);
		}
	);

	it("rejects different application names across selected versions", ({
		expect,
	}) => {
		expect(() =>
			getVersionedDurableObjectContainerApplications(
				[
					version([{ ...identity, images }]),
					version([{ ...identity, name: "other" }]),
				],
				"worker"
			)
		).toThrow("identical Durable Object-managed Container applications");
	});

	it.for([
		[{ name: "sandbox", images }],
		[{ class_name: "Sandbox", images }],
		[
			{ ...identity, images },
			{ ...identity, name: "duplicate" },
		],
	])(
		"rejects invalid native image associations %j",
		(containers, { expect }) => {
			expect(() =>
				getVersionedDurableObjectContainerApplications(
					[version(containers)],
					"worker"
				)
			).toThrow("invalid Durable Object-managed Container metadata");
		}
	);
});
