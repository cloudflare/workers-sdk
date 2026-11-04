import { FUSE_CONTAINER_PRIVILEGES } from "@cloudflare/containers-shared";
import { Message, utils } from "capnp-es";
import { test } from "vitest";
import { serializeConfig } from "../../src/runtime/config";
import type { Worker_Binding } from "../../src/runtime/config";
import { Config as CapnpConfig } from "../../src/runtime/config/generated/workerd";

test("serializes Durable Object container options", ({ expect }) => {
	const buffer = serializeConfig({
		services: [
			{
				name: "worker",
				worker: {
					durableObjectNamespaces: [
						{
							className: "ExampleContainer",
							uniqueKey: "example",
							container: {
								images: [
									{ name: "api", image: "example-api:latest" },
									{ name: "worker", image: "example-worker:latest" },
								],
								privileges: FUSE_CONTAINER_PRIVILEGES,
							},
						},
						{
							className: "EmptyContainer",
							uniqueKey: "empty",
							container: {},
						},
						{
							className: "DefaultImageContainer",
							uniqueKey: "default-image",
							container: { imageName: "example:latest" },
						},
						{
							className: "NoContainer",
							uniqueKey: "no-container",
						},
					],
				},
			},
		],
	});
	const config = new Message(buffer, false).getRoot(CapnpConfig);
	const namespaces = config.services.get(0).worker.durableObjectNamespaces;
	const containerNamespace = namespaces.get(0);
	const emptyContainerNamespace = namespaces.get(1);
	const defaultImageContainerNamespace = namespaces.get(2);
	const noContainerNamespace = namespaces.get(3);

	expect(containerNamespace._hasContainer()).toBe(true);
	expect(emptyContainerNamespace._hasContainer()).toBe(true);
	expect(defaultImageContainerNamespace._hasContainer()).toBe(true);
	expect(noContainerNamespace._hasContainer()).toBe(false);

	const container = containerNamespace.container;
	const emptyContainer = emptyContainerNamespace.container;
	const defaultImageContainer = defaultImageContainerNamespace.container;

	// Named-image Containers omit imageName so workerd requires an explicit
	// image or Container snapshot when starting them.
	expect(utils.isNull(utils.getPointer(0, container))).toBe(true);
	expect(utils.isNull(utils.getPointer(0, emptyContainer))).toBe(true);
	expect(utils.isNull(utils.getPointer(0, defaultImageContainer))).toBe(false);

	const privileges = container.privileges;
	const device = privileges.devices.get(0);
	const apiImage = container.images.get(0);
	const workerImage = container.images.get(1);

	expect(container.imageName).toBe("");
	expect(emptyContainer.imageName).toBe("");
	expect(emptyContainer.images.length).toBe(0);
	expect(defaultImageContainer.imageName).toBe("example:latest");
	expect(defaultImageContainer.images.length).toBe(0);
	expect(apiImage.name).toBe("api");
	expect(apiImage.image).toBe("example-api:latest");
	expect(workerImage.name).toBe("worker");
	expect(workerImage.image).toBe("example-worker:latest");
	expect(privileges.capabilities.get(0)).toBe("SYS_ADMIN");
	expect(device.pathOnHost).toBe("/dev/fuse");
	expect(device.pathInContainer).toBe("/dev/fuse");
	expect(device.cgroupPermissions).toBe("rwm");
	expect(privileges.securityOpt.get(0)).toBe("apparmor:unconfined");
});

test("serializes a Worker's Workflows engine", ({ expect }) => {
	const buffer = serializeConfig({
		services: [
			{
				name: "worker",
				worker: {
					workflowsEngine: {
						actorClass: { name: "engine", entrypoint: "Engine" },
						workflows: [
							{
								className: "MyWorkflow",
								name: "my-workflow",
								bindingService: {
									name: "workflows:my-workflow",
									entrypoint: "WorkflowBinding",
								},
							},
						],
					},
				},
			},
		],
	});
	const engine = new Message(buffer, false).getRoot(CapnpConfig).services.get(0)
		.worker.workflowsEngine;
	const workflow = engine.workflows.get(0);

	expect(engine.actorClass.name).toBe("engine");
	expect(engine.actorClass.entrypoint).toBe("Engine");
	expect(engine.workflows.length).toBe(1);
	expect(workflow.className).toBe("MyWorkflow");
	expect(workflow.name).toBe("my-workflow");
	expect(workflow.bindingService.name).toBe("workflows:my-workflow");
	expect(workflow.bindingService.entrypoint).toBe("WorkflowBinding");
});

// https://github.com/cloudflare/workers-sdk/issues/15271
test("serializing large modules does not recopy the whole capnp arena for each binding", ({
	expect,
}) => {
	// `serializeConfig` writes into capnp-es's default single-segment arena,
	// which grows by allocating a new buffer and copying the whole old arena
	// into it. Once the arena holds megabytes of module text, every small
	// allocation that follows (each binding's name and value) recopies the
	// entire arena, so peak memory scales with moduleBytes x bindingCount.
	// `Message#allocateSegment` is called every time the arena regrows, so
	// wrap it to count how many bytes those regrowths copy.
	const MODULE_BYTES = 4 * 1024 * 1024;
	const BINDINGS = 3000;
	const moduleText = "/*" + "x".repeat(MODULE_BYTES) + "*/";
	const bindings: Worker_Binding[] = [];
	for (let i = 0; i < BINDINGS; i++) {
		bindings.push({ name: `VAR_${i}`, text: `value-${i}` });
	}

	const originalAllocateSegment = Message.prototype.allocateSegment;
	let copiedBytes = 0;
	let previousArenaBytes = 0;
	Message.prototype.allocateSegment = function (byteLength: number) {
		const segment = originalAllocateSegment.call(this, byteLength);
		// Each regrowth copies the previous arena into a new buffer.
		copiedBytes += previousArenaBytes;
		previousArenaBytes = segment.buffer.byteLength;
		return segment;
	};

	let buffer: Uint8Array;
	try {
		buffer = serializeConfig({
			services: [
				{
					name: "worker",
					worker: {
						compatibilityDate: "2026-01-01",
						modules: [{ name: "/virtual/worker.js", esModule: moduleText }],
						bindings,
					},
				},
			],
		});
	} finally {
		Message.prototype.allocateSegment = originalAllocateSegment;
	}

	// The config must still serialize correctly: one service, all 3000
	// bindings present, and the module text intact.
	const worker = new Message(buffer, false).getRoot(CapnpConfig).services.get(
		0,
	).worker;
	expect(worker.bindings.length).toBe(BINDINGS);
	expect(worker.bindings.get(BINDINGS - 1).name).toBe(`VAR_${BINDINGS - 1}`);
	expect(worker.modules.get(0).esModule).toBe(moduleText);

	// Regrowing by whole-arena copies multiplies peak memory by the binding
	// count. A well-behaved serialization may copy the arena a few times over
	// (e.g. geometric growth), but must stay within a small multiple of the
	// serialized config's size, regardless of how many bindings follow the
	// module text.
	expect(copiedBytes).toBeLessThan(4 * buffer.byteLength);
});
