import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/$workerName/r2/$bucketName")({
	component: () => <Outlet />,
});
