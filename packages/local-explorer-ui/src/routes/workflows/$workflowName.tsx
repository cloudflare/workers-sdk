import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/workflows/$workflowName")({
	component: () => <Outlet />,
	loader: async ({ params }) => {
		return {
			workflowName: params.workflowName,
		};
	},
	validateSearch: (search: Record<string, unknown>): { worker?: string } => ({
		worker: typeof search.worker === "string" ? search.worker : undefined,
	}),
});
