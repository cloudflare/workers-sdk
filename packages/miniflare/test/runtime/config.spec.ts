import { FUSE_CONTAINER_PRIVILEGES } from "@cloudflare/containers-shared";
import { Message } from "capnp-es";
import { test } from "vitest";
import { serializeConfig } from "../../src/runtime/config";
import { Config as CapnpConfig } from "../../src/runtime/config/generated/workerd";
import { kVoid } from "../../src/runtime/config/workerd";

test("serializes Durable Object namespace options", ({ expect }) => {
	const buffer = serializeConfig({
		services: [
			{
				name: "worker",
				worker: {
					durableObjectNamespaces: [
						{
							className: "ExampleRunner",
							ephemeralLocal: kVoid,
							preventEviction: true,
							unsafeUseIsolateNodePortScopeForActor: "singleton",
						},
						{
							className: "ExampleContainer",
							uniqueKey: "example",
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
	const namespaces = config.services.get(0).worker.durableObjectNamespaces;
	const runnerNamespace = namespaces.get(0);
	const containerNamespace = namespaces.get(1);
	const privileges = containerNamespace.container.privileges;
	const device = privileges.devices.get(0);

	expect(runnerNamespace.preventEviction).toBe(true);
	expect(runnerNamespace.unsafeUseIsolateNodePortScopeForActor).toBe(
		"singleton"
	);
	expect(containerNamespace.container.images.get(0).name).toBe("sidecar");
	expect(containerNamespace.container.images.get(0).image).toBe(
		"sidecar:latest"
	);
	expect(privileges.capabilities.get(0)).toBe("SYS_ADMIN");
	expect(device.pathOnHost).toBe("/dev/fuse");
	expect(device.pathInContainer).toBe("/dev/fuse");
	expect(device.cgroupPermissions).toBe("rwm");
	expect(privileges.securityOpt.get(0)).toBe("apparmor:unconfined");
});
