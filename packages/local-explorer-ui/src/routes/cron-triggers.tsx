import {
	createFileRoute,
	getRouteApi,
	Outlet,
	redirect,
	useRouter,
} from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import {
	CronTriggersProvider,
	useCronTriggers,
} from "../components/cron-triggers/CronTriggersContext";
import {
	filterVisibleWorkers,
	getSelectedWorker,
} from "../components/WorkerSelector";
import { isEqual } from "../utils/is-equal";
import type { LocalExplorerWorker } from "../api";
import type { JSX } from "react";

export const Route = createFileRoute("/cron-triggers")({
	beforeLoad: ({ location, search }) => {
		if (/\/cron-triggers\/?$/.test(location.pathname)) {
			throw redirect({
				replace: true,
				search,
				to: "/cron-triggers/configured",
			});
		}
	},
	component: CronTriggersLayout,
	validateSearch: (search: Record<string, unknown>): { worker?: string } => ({
		worker:
			typeof search.worker === "string" && search.worker !== ""
				? search.worker
				: undefined,
	}),
});

const rootRoute = getRouteApi("__root__");

function CronTriggersLayout(): JSX.Element {
	const loaderData = rootRoute.useLoaderData();
	const navigate = Route.useNavigate();
	const rootMatchId = rootRoute.useMatch({ select: (match) => match.id });
	const router = useRouter();
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
	const handleWorkerMetadata = useCallback(
		(metadata: LocalExplorerWorker[]) => {
			const visibleMetadata = filterVisibleWorkers(metadata);
			if (visibleMetadata.length === 0) {
				return;
			}
			const knownWorkers = new Map(
				loaderData.workers.map((worker) => [worker.name, worker])
			);
			const metadataChanged = visibleMetadata.some(
				(worker) => !isEqual(knownWorkers.get(worker.name), worker)
			);
			if (loaderData.bootstrapAuthoritative && !metadataChanged) {
				return;
			}
			const refreshedNames = new Set(metadata.map((worker) => worker.name));
			const workers = [
				...metadata,
				...loaderData.workers.filter(
					(worker) => !refreshedNames.has(worker.name)
				),
			];
			router.updateMatch(rootMatchId, (match) => ({
				...match,
				loaderData: { bootstrapAuthoritative: true, workers },
			}));
		},
		[loaderData.bootstrapAuthoritative, loaderData.workers, rootMatchId, router]
	);

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
			activeWorkerName={activeWorkerName}
			bootstrapAuthoritative={loaderData.bootstrapAuthoritative}
			onWorkerMetadata={handleWorkerMetadata}
			seedWorkers={loaderData.workers}
		>
			<CronTriggersContent
				bootstrapAuthoritative={loaderData.bootstrapAuthoritative}
			/>
		</CronTriggersProvider>
	);
}

function CronTriggersContent({
	bootstrapAuthoritative,
}: {
	bootstrapAuthoritative: boolean;
}): JSX.Element {
	const cron = useCronTriggers();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();

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

	return <Outlet />;
}
