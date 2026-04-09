import { Toasty } from "@cloudflare/kumo";
import {
	createRootRoute,
	Outlet,
	useRouter,
	useRouterState,
} from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { localExplorerListWorkers } from "../api";
import { NotFound } from "../components/NotFound";
import { Sidebar } from "../components/Sidebar";
import {
	filterVisibleWorkers,
	getSelectedWorker,
} from "../components/WorkerSelector";

export const Route = createRootRoute({
	component: RootLayout,
	notFoundComponent: NotFound,
	loader: async () => {
		const workersResponse = await localExplorerListWorkers();
		const workers = workersResponse.data?.result ?? [];
		return { workers };
	},
});

function RootLayout() {
	const loaderData = Route.useLoaderData();
	const routerState = useRouterState();
	const currentPath = routerState.location.pathname;
	const router = useRouter();

	const visibleWorkers = useMemo(
		() => filterVisibleWorkers(loaderData.workers),
		[loaderData.workers]
	);

	const selectedWorkerObj = useMemo(
		() => getSelectedWorker(loaderData.workers, routerState.location.searchStr),
		[loaderData.workers, routerState.location.searchStr]
	);

	const selectedWorker = selectedWorkerObj?.name ?? "";

	const handleWorkerChange = useCallback(
		(workerName: string) => {
			const currentSearch = new URLSearchParams(routerState.location.searchStr);
			currentSearch.set("worker", workerName);
			router.history.push(
				`${window.location.pathname}?${currentSearch.toString()}`
			);
		},
		[router, routerState.location.searchStr]
	);

	return (
		<Toasty>
			<div className="flex min-h-screen">
				<Sidebar
					currentPath={currentPath}
					bindings={selectedWorkerObj?.bindings}
					workers={visibleWorkers}
					selectedWorker={selectedWorker}
					onWorkerChange={handleWorkerChange}
				/>
				<main className="flex flex-1 flex-col overflow-y-auto">
					<Outlet />
				</main>
			</div>
		</Toasty>
	);
}
