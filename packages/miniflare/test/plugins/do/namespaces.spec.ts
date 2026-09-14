import { FUSE_CONTAINER_PRIVILEGES } from "@cloudflare/containers-shared";
import { test } from "vitest";
import { getDurableObjectNamespaces } from "../../../src/plugins/do/namespaces";
import { kUnsafeEphemeralUniqueKey } from "../../../src/plugins/shared/unsafe-unique-key";
import { kVoid } from "../../../src/runtime/config/workerd";
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

test("configures isolate Node port scope for one ephemeral actor", ({
	expect,
}) => {
	const classNames: DurableObjectClasses = new Map([
		[
			"RunnerObject",
			{
				unsafeUniqueKey: kUnsafeEphemeralUniqueKey,
				unsafePreventEviction: true,
				unsafeUseIsolateNodePortScopeForActor: "singleton",
			},
		],
		["RegularObject", {}],
	]);
	const namespaces = getDurableObjectNamespaces(
		classNames,
		"worker",
		undefined
	);
	const runnerObject = namespaces.find(
		({ className }) => className === "RunnerObject"
	);
	const regularObject = namespaces.find(
		({ className }) => className === "RegularObject"
	);

	expect(runnerObject).toMatchObject({
		className: "RunnerObject",
		ephemeralLocal: kVoid,
		preventEviction: true,
		unsafeUseIsolateNodePortScopeForActor: "singleton",
	});
	expect(regularObject?.unsafeUseIsolateNodePortScopeForActor).toBeUndefined();
});
