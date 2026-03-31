import { createFileRoute, Outlet } from "@tanstack/react-router";
import { durableObjectsNamespaceListNamespaces } from "../../api";
import { ResourceNotFound } from "../../components/ResourceNotFound";

export const Route = createFileRoute("/do/$className")({
	component: () => <Outlet />,
	errorComponent: ResourceNotFound,
	loader: async ({ params }) => {
		const response = await durableObjectsNamespaceListNamespaces();
		const namespaces = response.data?.result ?? [];

		// Find the namespace that matches this class name
		const namespace = namespaces.find(
			(ns) =>
				ns.class === params.className ||
				ns.name === params.className ||
				ns.id === params.className
		);
		if (!namespace?.id) {
			throw new Error(`Durable Object class "${params.className}" not found`);
		}

		return {
			className: params.className,
			namespaceId: namespace.id,
		};
	},
});
