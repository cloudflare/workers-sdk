import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { CronTriggersProvider } from "../../components/cron-triggers/CronTriggersContext";
import { CronTriggersPage } from "../../components/cron-triggers/CronTriggersPage";
import { getSelectedWorker } from "../../components/WorkerSelector";
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
	const search = Route.useSearch();
	const activeWorkerName = loaderData.bootstrapAuthoritative
		? getSelectedWorker(
				loaderData.workers,
				search.worker
					? new URLSearchParams({ worker: search.worker }).toString()
					: ""
			)?.name
		: search.worker;

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
