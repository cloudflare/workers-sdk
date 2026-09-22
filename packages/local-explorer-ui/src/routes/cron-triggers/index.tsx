import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/cron-triggers/")({
	beforeLoad: ({ search }) => {
		throw redirect({
			replace: true,
			search,
			to: "/cron-triggers/configured",
		});
	},
});
