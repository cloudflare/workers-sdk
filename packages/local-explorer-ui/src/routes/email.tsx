import {
	createFileRoute,
	getRouteApi,
	Outlet,
	useMatchRoute,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect, type JSX } from "react";
import { getSelectedWorker } from "../components/WorkerSelector";

export const Route = createFileRoute("/email")({
	component: EmailLayout,
	validateSearch: (search: Record<string, unknown>): { worker?: string } => ({
		worker: typeof search.worker === "string" ? search.worker : undefined,
	}),
});

const rootRoute = getRouteApi("__root__");

function EmailLayout(): JSX.Element {
	const { workers } = rootRoute.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const routingListMatch = matchRoute({
		includeSearch: false,
		to: "/email/routing",
	});
	const routingDetailParams = matchRoute({
		includeSearch: false,
		to: "/email/routing/$captureId",
	});
	const sendingRouteMatch = matchRoute({
		includeSearch: false,
		to: "/email/sending",
	});
	const listRoute = routingListMatch
		? ("/email/routing" as const)
		: sendingRouteMatch
			? ("/email/sending" as const)
			: undefined;
	const selectedWorker =
		getSelectedWorker(
			workers,
			search.worker === undefined
				? ""
				: `?worker=${encodeURIComponent(search.worker)}`
		)?.name ?? "";

	useEffect(() => {
		// Detail URLs identify a specific Worker-owned resource. If that Worker is
		// no longer visible, preserve the requested identity so the detail API can
		// report it as missing or unavailable instead of targeting the default Worker.
		if (routingDetailParams) {
			return;
		}
		if (selectedWorker === "" || search.worker === selectedWorker) {
			return;
		}

		if (listRoute) {
			void navigate({
				replace: true,
				search: (previous) => ({ ...previous, worker: selectedWorker }),
				to: listRoute,
			});
		}
	}, [listRoute, navigate, routingDetailParams, search.worker, selectedWorker]);

	return <Outlet />;
}
