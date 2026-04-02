import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ResourceError } from "../../components/ResourceError";

export const Route = createFileRoute("/workflows/$workflowName")({
	component: () => <Outlet />,
	errorComponent: ResourceError,
	loader: async ({ params }) => {
		return {
			workflowName: params.workflowName,
		};
	},
});
