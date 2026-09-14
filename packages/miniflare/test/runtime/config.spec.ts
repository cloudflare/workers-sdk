import { FUSE_CONTAINER_PRIVILEGES } from "@cloudflare/containers-shared";
import { Message } from "capnp-es";
import { test } from "vitest";
import { serializeConfig } from "../../src/runtime/config";
import { Config as CapnpConfig } from "../../src/runtime/config/generated/workerd";

test("serializes Durable Object namespace options", ({ expect }) => {
	const buffer = serializeConfig({
		services: [
			{
				name: "worker",
				worker: {
					durableObjectNamespaces: [
						{
							className: "ExampleContainer",
							uniqueKey: "example",
							preventEviction: true,
							unsafeUseIsolateNodePortScope: true,
							container: {
								imageName: "example:latest",
								images: [{ name: "sidecar", image: "sidecar:latest" }],
								privileges: FUSE_CONTAINER_PRIVILEGES,
							},
						},
					],
				},
			},
		],
	});
	const config = new Message(buffer, false).getRoot(CapnpConfig);
	const namespace = config.services
		.get(0)
		.worker.durableObjectNamespaces.get(0);
	const privileges = namespace.container.privileges;
	const device = privileges.devices.get(0);

	expect(namespace.preventEviction).toBe(true);
	expect(namespace.unsafeUseIsolateNodePortScope).toBe(true);
	expect(namespace.container.images.get(0).name).toBe("sidecar");
	expect(namespace.container.images.get(0).image).toBe("sidecar:latest");
	expect(privileges.capabilities.get(0)).toBe("SYS_ADMIN");
	expect(device.pathOnHost).toBe("/dev/fuse");
	expect(device.pathInContainer).toBe("/dev/fuse");
	expect(device.cgroupPermissions).toBe("rwm");
	expect(privileges.securityOpt.get(0)).toBe("apparmor:unconfined");
});
