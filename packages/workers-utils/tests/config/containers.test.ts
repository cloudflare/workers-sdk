import { describe, test } from "vitest";
import {
	getContainerDurableObjectClassNames,
	getContainerInstanceGroupExports,
	getContainerNameToClassNameMap,
	resolveContainerClassName,
} from "../../src/config/containers";
import type { ContainerApp, Exports } from "../../src/config/environment";

function container(props: Partial<ContainerApp>): ContainerApp {
	return { image: "./Dockerfile", ...props };
}

describe("getContainerNameToClassNameMap", () => {
	test("returns an empty map when exports are undefined", ({ expect }) => {
		expect(getContainerNameToClassNameMap(undefined)).toEqual(new Map());
	});

	test("ignores exports that do not attach a container", ({ expect }) => {
		const exports: Exports = {
			Counter: { type: "durable-object", storage: "sqlite" },
			Admin: { type: "worker" },
		};

		expect(getContainerNameToClassNameMap(exports)).toEqual(new Map());
	});

	test("maps container names to their Durable Object class names", ({
		expect,
	}) => {
		const exports: Exports = {
			Counter: {
				type: "durable-object",
				storage: "sqlite",
				container: "my-container",
			},
			Incoming: {
				type: "durable-object",
				state: "expecting-transfer",
				storage: "sqlite",
				transfer_from: "other-worker",
				container: "incoming-container",
			},
		};

		expect(getContainerNameToClassNameMap(exports)).toEqual(
			new Map([
				["my-container", "Counter"],
				["incoming-container", "Incoming"],
			])
		);
	});
});

describe("getContainerInstanceGroupExports", () => {
	test("returns live namespace-backed Container Instance Groups", ({
		expect,
	}) => {
		const exports: Exports = {
			Sandbox: {
				type: "durable-object",
				storage: "sqlite",
				container: {
					images: [
						{
							binding: "SANDBOX_IMAGE",
							image: "./Dockerfile",
						},
					],
				},
			},
			Incoming: {
				type: "durable-object",
				state: "expecting-transfer",
				storage: "sqlite",
				transfer_from: "other-worker",
				container: {},
			},
			Application: {
				type: "durable-object",
				storage: "sqlite",
				container: "application-container",
			},
			Deleted: {
				type: "durable-object",
				state: "deleted",
			},
		};

		expect(getContainerInstanceGroupExports(exports)).toEqual([
			{
				className: "Sandbox",
				config: {
					images: [
						{
							binding: "SANDBOX_IMAGE",
							image: "./Dockerfile",
						},
					],
				},
			},
			{
				className: "Incoming",
				config: {},
			},
		]);
	});
});

describe("resolveContainerClassName", () => {
	test("prefers the container's own class_name", ({ expect }) => {
		expect(
			resolveContainerClassName(
				container({ name: "my-container", class_name: "Counter" }),
				{
					Other: {
						type: "durable-object",
						storage: "sqlite",
						container: "my-container",
					},
				}
			)
		).toBe("Counter");
	});

	test("falls back to the export that references the container by name", ({
		expect,
	}) => {
		expect(
			resolveContainerClassName(container({ name: "my-container" }), {
				Counter: {
					type: "durable-object",
					storage: "sqlite",
					container: "my-container",
				},
			})
		).toBe("Counter");
	});

	test("returns undefined when the container is not linked to a Durable Object", ({
		expect,
	}) => {
		expect(
			resolveContainerClassName(container({ name: "my-container" }), {
				Counter: { type: "durable-object", storage: "sqlite" },
			})
		).toBeUndefined();
	});

	test("returns undefined when the container has neither a name nor a class_name", ({
		expect,
	}) => {
		expect(resolveContainerClassName(container({}), {})).toBeUndefined();
	});
});

describe("getContainerDurableObjectClassNames", () => {
	test("returns an empty set when there are no containers", ({ expect }) => {
		expect(getContainerDurableObjectClassNames(undefined, {})).toEqual(
			new Set()
		);
	});

	test("resolves class names from both directions of the link", ({
		expect,
	}) => {
		const containers = [
			container({ name: "bound", class_name: "Bound" }),
			container({ name: "referenced" }),
			container({ name: "unlinked" }),
		];
		const exports: Exports = {
			Bound: { type: "durable-object", storage: "sqlite" },
			Referenced: {
				type: "durable-object",
				storage: "sqlite",
				container: "referenced",
			},
		};

		expect(getContainerDurableObjectClassNames(containers, exports)).toEqual(
			new Set(["Bound", "Referenced"])
		);
	});
});
