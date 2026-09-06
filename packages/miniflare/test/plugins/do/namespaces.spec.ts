import { FUSE_CONTAINER_PRIVILEGES } from "@cloudflare/containers-shared";
import { test } from "vitest";
import { getDurableObjectNamespaces } from "../../../src/plugins/do/namespaces";
import type { DurableObjectClassNames } from "../../../src/plugins/shared";

type DurableObjectClasses = NonNullable<
	ReturnType<DurableObjectClassNames["get"]>
>;

test("builds Durable Object namespaces with detected container privileges", ({
	expect,
}) => {
	const classNames: DurableObjectClasses = new Map([
		["ContainerObject", { container: { imageName: "example:latest" } }],
		["RegularObject", {}],
	]);
	const namespaces = getDurableObjectNamespaces(
		classNames,
		"worker",
		FUSE_CONTAINER_PRIVILEGES
	);
	const containerObject = namespaces.find(
		({ className }) => className === "ContainerObject"
	);
	const regularObject = namespaces.find(
		({ className }) => className === "RegularObject"
	);

	expect(containerObject).toMatchObject({
		className: "ContainerObject",
		uniqueKey: "worker-ContainerObject",
		container: {
			imageName: "example:latest",
			privileges: FUSE_CONTAINER_PRIVILEGES,
		},
	});
	expect(regularObject?.container).toBeUndefined();

	const namespacesWithoutPrivileges = getDurableObjectNamespaces(
		classNames,
		"worker",
		undefined
	);
	const containerWithoutPrivileges = namespacesWithoutPrivileges.find(
		({ className }) => className === "ContainerObject"
	);

	expect(containerWithoutPrivileges?.container?.imageName).toBe(
		"example:latest"
	);
	expect(containerWithoutPrivileges?.container?.privileges).toBeUndefined();
});
