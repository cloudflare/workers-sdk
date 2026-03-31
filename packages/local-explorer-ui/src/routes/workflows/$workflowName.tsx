import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ResourceNotFound } from "../../components/ResourceNotFound";

export const Route = createFileRoute("/workflows/$workflowName")({
	component: () => <Outlet />,
	errorComponent: ResourceNotFound,
	loader: async ({ params }) => {
		return {
			workflowName: params.workflowName,
		};
	},
});
