import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RouteError } from "../../components/ResourceNotFound";

export const Route = createFileRoute("/r2/$bucketName")({
	component: () => <Outlet />,
	errorComponent: RouteError,
});
