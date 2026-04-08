import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/r2/$bucketName")({
	component: () => <Outlet />,
	validateSearch: (search: Record<string, unknown>): { worker?: string } => ({
		worker: typeof search.worker === "string" ? search.worker : undefined,
	}),
});
