import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ResourceError } from "../../components/ResourceError";

export const Route = createFileRoute("/email/routing")({
	component: () => <Outlet />,
	errorComponent: ResourceError,
	validateSearch: (search: Record<string, unknown>): { worker?: string } => ({
		worker: typeof search.worker === "string" ? search.worker : undefined,
	}),
});
