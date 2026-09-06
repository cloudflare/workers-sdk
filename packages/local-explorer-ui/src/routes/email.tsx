import {
	createFileRoute,
	getRouteApi,
	Outlet,
	useMatchRoute,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect, type JSX } from "react";
import { TestEmailDraftsProvider } from "../components/email/TestEmailDraftsContext";
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
		to: "/email/routing/$emailId",
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
		if (selectedWorker === "" || search.worker === selectedWorker) {
			return;
		}

		if (routingDetailParams) {
			void navigate({
				params: routingDetailParams,
				replace: true,
				search: (previous) => ({ ...previous, worker: selectedWorker }),
				to: "/email/routing/$emailId",
			});
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

	return (
		<TestEmailDraftsProvider>
			<Outlet />
		</TestEmailDraftsProvider>
	);
}
