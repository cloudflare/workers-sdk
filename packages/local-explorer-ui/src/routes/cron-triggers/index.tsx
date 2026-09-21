import {
	createFileRoute,
	getRouteApi,
	useRouter,
} from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import {
	CronTriggersProvider,
	useCronTriggers,
} from "../../components/cron-triggers/CronTriggersContext";
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
			<CronTriggersContent
				activeWorkerName={activeWorkerName}
				bootstrapAuthoritative={loaderData.bootstrapAuthoritative}
			/>
		</CronTriggersProvider>
	);
}

function CronTriggersContent({
	activeWorkerName,
	bootstrapAuthoritative,
}: {
	activeWorkerName?: string;
	bootstrapAuthoritative: boolean;
}): JSX.Element {
	const cron = useCronTriggers();
	const navigate = Route.useNavigate();
	const router = useRouter();
	const search = Route.useSearch();
	const rootRecoveryInFlight = useRef(false);
	const recoveredWorkerName =
		!bootstrapAuthoritative && cron.visibleWorkerNames.length > 0
			? search.worker && cron.visibleWorkerNames.includes(search.worker)
				? search.worker
				: cron.fallbackWorkerName
			: activeWorkerName;

	useEffect(() => {
		if (bootstrapAuthoritative || cron.visibleWorkerNames.length === 0) {
			return;
		}
		const selectedWorker =
			search.worker && cron.visibleWorkerNames.includes(search.worker)
				? search.worker
				: cron.fallbackWorkerName;
		const canonicalWorker =
			cron.visibleWorkerNames.length > 1 ? selectedWorker : undefined;
		if (search.worker === canonicalWorker) {
			return;
		}
		void navigate({
			replace: true,
			search: (previous) => ({ ...previous, worker: canonicalWorker }),
		});
	}, [
		bootstrapAuthoritative,
		cron.fallbackWorkerName,
		cron.visibleWorkerNames,
		navigate,
		search.worker,
	]);

	useEffect(() => {
		if (
			bootstrapAuthoritative ||
			cron.visibleWorkerNames.length === 0 ||
			rootRecoveryInFlight.current
		) {
			return;
		}
		rootRecoveryInFlight.current = true;
		void router.invalidate().finally(() => {
			rootRecoveryInFlight.current = false;
		});
	}, [bootstrapAuthoritative, cron.visibleWorkerNames, router]);

	return <CronTriggersPage activeWorkerName={recoveredWorkerName} />;
}
