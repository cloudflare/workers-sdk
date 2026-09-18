import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useEffect } from "react";
import { CronTriggersProvider } from "../../components/cron-triggers/CronTriggersContext";
import { CronTriggersPage } from "../../components/cron-triggers/CronTriggersPage";
import {
	filterVisibleWorkers,
	getSelectedWorker,
} from "../../components/WorkerSelector";
import type { JSX } from "react";

export const Route = createFileRoute("/cron-triggers/")({
	component: CronTriggersRoute,
	validateSearch: (search: Record<string, unknown>): { worker?: string } => ({
		worker:
			typeof search.worker === "string" && search.worker !== ""
				? search.worker
				: undefined,
	}),
});

const rootRoute = getRouteApi("__root__");

function CronTriggersRoute(): JSX.Element {
	const loaderData = rootRoute.useLoaderData();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const visibleWorkerCount = filterVisibleWorkers(loaderData.workers).length;
	const selectedWorker = loaderData.bootstrapAuthoritative
		? getSelectedWorker(
				loaderData.workers,
				search.worker
					? new URLSearchParams({ worker: search.worker }).toString()
					: ""
			)
		: undefined;
	const activeWorkerName = loaderData.bootstrapAuthoritative
		? selectedWorker?.name
		: search.worker;

	useEffect(() => {
		if (!loaderData.bootstrapAuthoritative || !selectedWorker) {
			return;
		}
		const canonicalWorker =
			visibleWorkerCount > 1 ? selectedWorker.name : undefined;
		if (search.worker === canonicalWorker) {
			return;
		}
		void navigate({
			replace: true,
			search: (previous) => ({ ...previous, worker: canonicalWorker }),
		});
	}, [
		loaderData.bootstrapAuthoritative,
		navigate,
		search.worker,
		selectedWorker,
		visibleWorkerCount,
	]);

	return (
		<CronTriggersProvider
			active={true}
			activeWorkerName={activeWorkerName}
			bootstrapAuthoritative={loaderData.bootstrapAuthoritative}
			seedWorkers={loaderData.workers}
		>
			<CronTriggersPage activeWorkerName={activeWorkerName} />
		</CronTriggersProvider>
	);
}
