import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { durableObjectsNamespaceListNamespaces } from "../../api";
import { NotFound } from "../../components/NotFound";
import { ResourceError } from "../../components/ResourceError";

export const Route = createFileRoute("/do/$className")({
	component: () => <Outlet />,
	errorComponent: ResourceError,
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
			throw notFound();
		}

		return {
			className: params.className,
			namespaceId: namespace.id,
		};
	},
	notFoundComponent: NotFound,
	validateSearch: (search: Record<string, unknown>): { worker?: string } => ({
		worker: typeof search.worker === "string" ? search.worker : undefined,
	}),
});
