import {
	Button,
	Dialog,
	Empty,
	InputGroup,
	RefreshButton,
	useKumoToastManager,
} from "@cloudflare/kumo";
import {
	FlagBannerIcon,
	FlaskIcon,
	MagnifyingGlassIcon,
	PlusIcon,
	XIcon,
} from "@phosphor-icons/react";
import {
	createFileRoute,
	getRouteApi,
	notFound,
	useRouter,
	useRouterState,
} from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
	flagshipDeleteFlag,
	flagshipListFlags,
	flagshipUpdateFlag,
} from "../../api";
import FlagshipIcon from "../../assets/icons/flagship.svg?react";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { flagshipErrorMessage } from "../../components/flagship/flag-helpers";
import { FlagDialog } from "../../components/flagship/FlagDialog";
import { FlagTable } from "../../components/flagship/FlagTable";
import { TextInput } from "../../components/flagship/FormFields";
import { TestFlagDialog } from "../../components/flagship/TestFlagDialog";
import { NotFound } from "../../components/NotFound";
import { ResourceError } from "../../components/ResourceError";
import { getSelectedWorker } from "../../components/WorkerSelector";
import type { FlagshipFlag } from "../../api";
import type { JSX } from "react";

const rootRoute = getRouteApi("__root__");

export const Route = createFileRoute("/flagship/$appId")({
	component: FlagshipAppView,
	errorComponent: ResourceError,
	loader: async ({ params }) => {
		const response = await flagshipListFlags({
			path: { app_id: params.appId },
			throwOnError: false,
		});
		if (response.response?.status === 404) {
			throw notFound();
		}
		if (response.error) {
			throw new Error(`Failed to list flags for app "${params.appId}"`);
		}
		return { flags: response.data?.result ?? [] };
	},
	notFoundComponent: NotFound,
	validateSearch: (search: Record<string, unknown>): { worker?: string } => ({
		worker: typeof search.worker === "string" ? search.worker : undefined,
	}),
});

/**
 * Renders the flag list for a locally simulated Flagship application.
 */
function FlagshipAppView(): JSX.Element {
	const { appId } = Route.useParams();
	const { flags } = Route.useLoaderData();
	const router = useRouter();
	const toast = useKumoToastManager();
	const rootData = rootRoute.useLoaderData();
	const routerState = useRouterState();

	const bindingName = useMemo(() => {
		const worker = getSelectedWorker(
			rootData.workers,
			routerState.location.searchStr
		);
		return worker?.bindings?.flagship?.find((app) => app.id === appId)
			?.bindingName;
	}, [appId, rootData.workers, routerState.location.searchStr]);

	const [creating, setCreating] = useState(false);
	const [editTarget, setEditTarget] = useState<FlagshipFlag | null>(null);
	const [testTarget, setTestTarget] = useState<string | null>();
	const [deleteTarget, setDeleteTarget] = useState<FlagshipFlag | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [pendingKey, setPendingKey] = useState<string | null>(null);
	const [refreshing, setRefreshing] = useState(false);
	const [query, setQuery] = useState("");

	const filteredFlags = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (needle === "") {
			return flags;
		}
		return flags.filter((flag) => {
			const key = flag.key?.toLowerCase() ?? "";
			const description = flag.description?.toLowerCase() ?? "";
			return key.includes(needle) || description.includes(needle);
		});
	}, [flags, query]);

	function openTest(flag?: FlagshipFlag): void {
		setTestTarget(flag?.key ?? null);
	}

	async function refresh(): Promise<void> {
		setRefreshing(true);
		try {
			await router.invalidate();
		} catch (error) {
			toast.add({
				description: flagshipErrorMessage(error, "Failed to refresh flags"),
				title: "Refresh failed",
				variant: "error",
			});
		} finally {
			setRefreshing(false);
		}
	}

	async function toggleFlag(flag: FlagshipFlag): Promise<void> {
		if (flag.key === undefined) {
			return;
		}
		setPendingKey(flag.key);
		try {
			await flagshipUpdateFlag({
				body: { enabled: !flag.enabled },
				path: { app_id: appId, flag_key: flag.key },
			});
		} catch (error) {
			toast.add({
				description: flagshipErrorMessage(error, "Failed to update flag"),
				title: "Update failed",
				variant: "error",
			});
			return;
		} finally {
			setPendingKey(null);
		}
		await refresh();
	}

	async function confirmDelete(): Promise<void> {
		if (deleteTarget?.key === undefined) {
			return;
		}
		setDeleting(true);
		try {
			await flagshipDeleteFlag({
				path: { app_id: appId, flag_key: deleteTarget.key },
			});
		} catch (error) {
			toast.add({
				description: flagshipErrorMessage(error, "Failed to delete flag"),
				title: "Delete failed",
				variant: "error",
			});
			return;
		} finally {
			setDeleting(false);
		}
		setDeleteTarget(null);
		await refresh();
	}

	const searching = query.trim() !== "";

	return (
		<div className="flex h-full flex-col">
			<Breadcrumbs
				icon={FlagshipIcon}
				items={[
					<span className="flex items-center gap-1.5" key="app">
						{bindingName && bindingName !== appId ? (
							<>
								{bindingName}
								<span className="text-kumo-subtle">({appId})</span>
							</>
						) : (
							appId
						)}
					</span>,
				]}
				title="Flagship"
			>
				{flags.length === 0 ? null : (
					<Button
						className="ml-auto"
						icon={FlaskIcon}
						onClick={() => openTest()}
						variant="secondary"
					>
						Test
					</Button>
				)}
				<Button
					className={flags.length === 0 ? "ml-auto" : undefined}
					icon={PlusIcon}
					onClick={() => setCreating(true)}
					variant="primary"
				>
					Create flag
				</Button>
			</Breadcrumbs>

			<div className="flex-1 overflow-y-auto bg-kumo-elevated">
				{flags.length === 0 ? (
					<div className="mx-auto flex min-h-full max-w-[1300px] items-center justify-center p-6 md:p-8">
						<Empty
							className="max-w-2xl"
							commandLine={`wrangler flagship flags pull ${appId}`}
							contents={
								<Button
									icon={PlusIcon}
									onClick={() => setCreating(true)}
									variant="primary"
								>
									Create flag
								</Button>
							}
							description="Flags you create here live in the local store, so the Worker running in dev reads them straight away. You can also pull an existing application's flags from Cloudflare."
							icon={
								<FlagBannerIcon
									className="text-kumo-subtle"
									size={40}
									weight="duotone"
								/>
							}
							title="No feature flags found"
						/>
					</div>
				) : (
					<div className="mx-auto flex w-full max-w-[1300px] flex-col gap-4 p-6 md:p-8">
						<div className="flex items-center gap-3">
							<div className="max-w-md min-w-0 flex-1">
								<InputGroup>
									<label
										className="flex cursor-text items-center pl-2.5 text-kumo-subtle"
										htmlFor="flag-search"
									>
										<MagnifyingGlassIcon size={14} />
									</label>
									<TextInput
										ariaLabel="Search flags"
										className="h-full rounded-none px-2 ring-0 focus:ring-0"
										id="flag-search"
										onValueChange={setQuery}
										placeholder="Search flags by key or description"
										value={query}
									/>
									{searching ? (
										<InputGroup.Button
											aria-label="Clear search"
											onClick={() => setQuery("")}
											shape="square"
											variant="ghost"
										>
											<XIcon size={12} />
										</InputGroup.Button>
									) : null}
								</InputGroup>
							</div>
							<span className="ml-auto text-sm whitespace-nowrap text-kumo-subtle">
								{searching
									? `${filteredFlags.length} of ${flags.length}`
									: `${flags.length} ${flags.length === 1 ? "flag" : "flags"}`}
							</span>
							<RefreshButton
								loading={refreshing}
								onClick={() => void refresh()}
							/>
						</div>

						{filteredFlags.length === 0 ? (
							<Empty
								description={`No flags match "${query.trim()}".`}
								icon={
									<MagnifyingGlassIcon
										className="text-kumo-subtle"
										size={28}
										weight="duotone"
									/>
								}
								size="sm"
								title="No matching flags"
							/>
						) : (
							<FlagTable
								flags={filteredFlags}
								onDelete={setDeleteTarget}
								onEdit={setEditTarget}
								onTest={openTest}
								onToggle={(flag) => void toggleFlag(flag)}
								pendingKey={pendingKey}
							/>
						)}
					</div>
				)}
			</div>

			<FlagDialog
				appId={appId}
				flag={editTarget}
				flags={flags}
				onOpenChange={(open) => {
					if (!open) {
						setCreating(false);
						setEditTarget(null);
					}
				}}
				onSaved={refresh}
				open={creating || editTarget !== null}
			/>

			<TestFlagDialog
				appId={appId}
				flags={flags}
				initialFlagKey={testTarget ?? null}
				onOpenChange={(open) => {
					if (!open) {
						setTestTarget(undefined);
					}
				}}
				open={testTarget !== undefined}
			/>

			<Dialog.Root
				onOpenChange={(open: boolean) => {
					if (!open && !deleting) {
						setDeleteTarget(null);
					}
				}}
				open={deleteTarget !== null}
			>
				<Dialog className="p-6">
					{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
					<Dialog.Title className="text-lg font-semibold text-kumo-default">
						Delete flag?
					</Dialog.Title>
					{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
					<Dialog.Description className="mt-2 text-sm text-kumo-subtle">
						<span className="font-mono text-kumo-default">
							{deleteTarget?.key}
						</span>{" "}
						will be removed from the local store. Workers reading it will fall
						back to the default value passed in code.
					</Dialog.Description>
					<div className="mt-6 flex justify-end gap-2">
						<Button
							disabled={deleting}
							onClick={() => setDeleteTarget(null)}
							variant="secondary"
						>
							Cancel
						</Button>
						<Button
							disabled={deleting}
							loading={deleting}
							onClick={() => void confirmDelete()}
							variant="destructive"
						>
							Delete
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</div>
	);
}
