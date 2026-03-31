import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ResourceNotFound } from "../../components/ResourceNotFound";

export const Route = createFileRoute("/r2/$bucketName")({
	component: () => <Outlet />,
	errorComponent: ResourceNotFound,
});
