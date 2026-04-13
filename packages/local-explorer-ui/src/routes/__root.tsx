import { Sidebar, Toasty } from "@cloudflare/kumo";
import {
	createRootRoute,
	Outlet,
	useRouter,
	useRouterState,
} from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { localExplorerListWorkers } from "../api";
import { NotFound } from "../components/NotFound";
import { AppSidebar } from "../components/Sidebar";
import {
	filterVisibleWorkers,
	getSelectedWorker,
} from "../components/WorkerSelector";
import {
	loadSidebarOpenState,
	saveSidebarOpenState,
} from "../utils/sidebar-state";
import {
	applyThemeMode,
	getNextThemeMode,
	loadThemeMode,
	saveThemeMode,
} from "../utils/theme-state";
import type { ThemeMode } from "../utils/theme-state";

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

	const [sidebarOpen, setSidebarOpen] = useState<boolean>(loadSidebarOpenState);
	const [themeMode, setThemeMode] = useState<ThemeMode>(loadThemeMode);

	const handleSidebarOpenChange = useCallback((open: boolean) => {
		setSidebarOpen(open);
		saveSidebarOpenState(open);
	}, []);

	const handleCycleTheme = useCallback(() => {
		const next = getNextThemeMode(themeMode);
		saveThemeMode(next);
		applyThemeMode(
			next,
			window.matchMedia("(prefers-color-scheme: dark)").matches
		);
		setThemeMode(next);
	}, [themeMode]);

	// Filter out internal workers (like __asset-worker__, __router-worker__, etc.)
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
			<div className="flex h-screen">
				<Sidebar.Provider
					onOpenChange={handleSidebarOpenChange}
					open={sidebarOpen}
					resizable={true}
				>
					<AppSidebar
						bindings={selectedWorkerObj?.bindings}
						currentPath={currentPath}
						onCycleTheme={handleCycleTheme}
						onWorkerChange={handleWorkerChange}
						selectedWorker={selectedWorker}
						themeMode={themeMode}
						workers={visibleWorkers}
					/>
					<main className="flex flex-1 flex-col overflow-y-auto">
						<Outlet />
					</main>
				</Sidebar.Provider>
			</div>
		</Toasty>
	);
}
