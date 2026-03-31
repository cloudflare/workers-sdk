import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/$workerName/workflows/$workflowName")({
	component: () => <Outlet />,
	loader: async ({ params }) => {
		return {
			workflowName: params.workflowName,
		};
	},
});
