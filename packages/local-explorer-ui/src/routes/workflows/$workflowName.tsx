import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RouteError } from "../../components/ResourceNotFound";

export const Route = createFileRoute("/workflows/$workflowName")({
	component: () => <Outlet />,
	errorComponent: RouteError,
	loader: async ({ params }) => {
		return {
			workflowName: params.workflowName,
		};
	},
});
