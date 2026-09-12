import { FUSE_CONTAINER_PRIVILEGES } from "@cloudflare/containers-shared";
import { Message } from "capnp-es";
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
							className: "LegacyContainer",
							uniqueKey: "legacy",
							container: { imageName: "example:latest" },
						},
					],
				},
			},
		],
	});
	const config = new Message(buffer, false).getRoot(CapnpConfig);
	const container = config.services
		.get(0)
		.worker.durableObjectNamespaces.get(0).container;
	const emptyContainer = config.services
		.get(0)
		.worker.durableObjectNamespaces.get(1).container;
	const legacyContainer = config.services
		.get(0)
		.worker.durableObjectNamespaces.get(2).container;
	const privileges = container.privileges;
	const device = privileges.devices.get(0);
	const apiImage = container.images.get(0);
	const workerImage = container.images.get(1);

	expect(container.imageName).toBe("");
	expect(emptyContainer.imageName).toBe("");
	expect(emptyContainer.images.length).toBe(0);
	expect(legacyContainer.imageName).toBe("example:latest");
	expect(legacyContainer.images.length).toBe(0);
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
