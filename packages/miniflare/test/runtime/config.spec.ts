import { FUSE_CONTAINER_PRIVILEGES } from "@cloudflare/containers-shared";
import { Message, utils } from "capnp-es";
import { test } from "vitest";
import { serializeConfig } from "../../src/runtime/config";
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

test("serializes Durable Object binding retry policies", ({ expect }) => {
	const buffer = serializeConfig({
		services: [
			{
				name: "worker",
				worker: {
					bindings: [
						{
							name: "DEFAULT",
							durableObjectNamespace: { className: "Object" },
						},
						{
							name: "DISABLED",
							durableObjectNamespace: {
								className: "Object",
								retryPolicy: { maxAttempts: 0 },
							},
						},
						{
							name: "CONFIGURED",
							durableObjectNamespace: {
								className: "Object",
								retryPolicy: { maxAttempts: 7, timeoutMs: 500 },
							},
						},
					],
				},
			},
		],
	});
	const bindings = new Message(buffer, false)
		.getRoot(CapnpConfig)
		.services.get(0).worker.bindings;
	const defaultNamespace = bindings.get(0).durableObjectNamespace;
	const disabledPolicy = bindings.get(1).durableObjectNamespace.retryPolicy;
	const configuredPolicy = bindings.get(2).durableObjectNamespace.retryPolicy;

	expect(defaultNamespace._hasRetryPolicy()).toBe(false);
	expect(disabledPolicy.maxAttempts).toBe(0);
	expect(disabledPolicy.timeoutMs).toBe(10_000);
	expect(configuredPolicy.maxAttempts).toBe(7);
	expect(configuredPolicy.timeoutMs).toBe(500);
});
