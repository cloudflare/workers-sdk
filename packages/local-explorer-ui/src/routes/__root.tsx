import { Sidebar, Toasty } from "@cloudflare/kumo";
import {
	createRootRoute,
	Outlet,
	useRouter,
	useRouterState,
} from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { getWorkerChangeDestination } from "../utils/worker-navigation";
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
	const isEmailList =
		currentPath === "/email/sending" ||
		currentPath === "/email/routing" ||
		currentPath === "/email/routing/";
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

	useEffect(() => {
		if (selectedWorker === "") {
			return;
		}

		const currentSearch = new URLSearchParams(routerState.location.searchStr);
		if (currentSearch.get("worker") === selectedWorker) {
			return;
		}

		currentSearch.set("worker", selectedWorker);
		router.history.replace(
			`${window.location.pathname}?${currentSearch.toString()}`
		);
	}, [router, routerState.location.searchStr, selectedWorker]);

	const handleWorkerChange = useCallback(
		(workerName: string) => {
			const currentSearch = new URLSearchParams(routerState.location.searchStr);
			currentSearch.set("worker", workerName);
			// When viewing a specific email on the routing detail page, the selected
			// email belongs to the previous worker and won't exist under the new one.
			// Send the user back to the parent list page for the interface they're
			// using ("Routing" or "Sending") while preserving the worker selection.
			const destinationPath = getWorkerChangeDestination(
				window.location.pathname
			);
			router.history.push(`${destinationPath}?${currentSearch.toString()}`);
		},
		[router, routerState.location.searchStr]
	);

	return (
		<Toasty>
			<div className="flex h-screen overflow-hidden">
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
					<main
						className={`flex min-h-0 flex-1 flex-col ${
							isEmailList ? "overflow-hidden" : "overflow-y-auto"
						}`}
					>
						<Outlet />
					</main>
				</Sidebar.Provider>
			</div>
		</Toasty>
	);
}
