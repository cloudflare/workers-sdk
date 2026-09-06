import { FUSE_CONTAINER_PRIVILEGES } from "@cloudflare/containers-shared";
import { Message } from "capnp-es";
import { test } from "vitest";
import { serializeConfig } from "../../src/runtime/config";
import { Config as CapnpConfig } from "../../src/runtime/config/generated/workerd";

test("serializes Durable Object container privileges", ({ expect }) => {
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
								imageName: "example:latest",
								privileges: FUSE_CONTAINER_PRIVILEGES,
							},
						},
					],
				},
			},
		],
	});
	const config = new Message(buffer, false).getRoot(CapnpConfig);
	const privileges = config.services
		.get(0)
		.worker.durableObjectNamespaces.get(0).container.privileges;
	const device = privileges.devices.get(0);

	expect(privileges.capabilities.get(0)).toBe("SYS_ADMIN");
	expect(device.pathOnHost).toBe("/dev/fuse");
	expect(device.pathInContainer).toBe("/dev/fuse");
	expect(device.cgroupPermissions).toBe("rwm");
	expect(privileges.securityOpt.get(0)).toBe("apparmor:unconfined");
});
