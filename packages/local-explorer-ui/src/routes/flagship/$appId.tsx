import {
	Badge,
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
	useRouter,
	useRouterState,
} from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import {
	flagshipDeleteFlag,
	flagshipListFlags,
	flagshipUpdateFlag,
} from "../../api";
import FlagshipIcon from "../../assets/icons/flagship.svg?react";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { CopyButton } from "../../components/CopyButton";
import { CreateFlagDialog } from "../../components/CreateFlagDialog";
import { flagshipErrorMessage } from "../../components/flagship/flag-helpers";
import { FlagTable } from "../../components/flagship/FlagTable";
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
			throw new Error(
				`Flagship app "${params.appId}" is not simulated locally.`
			);
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
	const [testing, setTesting] = useState(false);
	const [initialTestKey, setInitialTestKey] = useState<string | null>(null);
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
	const enabledCount = flags.filter((flag) => flag.enabled === true).length;
	const ruleCount = flags.reduce(
		(total, flag) => total + (flag.rules?.length ?? 0),
		0
	);

	function openTest(flag?: FlagshipFlag): void {
		setInitialTestKey(flag?.key ?? null);
		setTesting(true);
	}

	const refresh = useCallback(async () => {
		setRefreshing(true);
		try {
			await router.invalidate();
		} finally {
			setRefreshing(false);
		}
	}, [router]);

	const toggleFlag = useCallback(
		async (flag: FlagshipFlag) => {
			if (flag.key === undefined) {
				return;
			}
			setPendingKey(flag.key);
			try {
				await flagshipUpdateFlag({
					body: { enabled: !flag.enabled },
					path: { app_id: appId, flag_key: flag.key },
				});
				await router.invalidate();
			} catch (error) {
				toast.add({
					description: flagshipErrorMessage(error, "Failed to update flag"),
					title: "Update failed",
					variant: "error",
				});
			} finally {
				setPendingKey(null);
			}
		},
		[appId, router, toast]
	);

	const confirmDelete = useCallback(async () => {
		if (deleteTarget?.key === undefined) {
			return;
		}
		setDeleting(true);
		try {
			await flagshipDeleteFlag({
				path: { app_id: appId, flag_key: deleteTarget.key },
			});
			setDeleteTarget(null);
			await router.invalidate();
		} catch (error) {
			toast.add({
				description: flagshipErrorMessage(error, "Failed to delete flag"),
				title: "Delete failed",
				variant: "error",
			});
		} finally {
			setDeleting(false);
		}
	}, [appId, deleteTarget, router, toast]);

	return (
		<>
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
			/>

			<div className="mx-auto w-full max-w-325 px-6 py-8">
				<header className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
					<div className="flex min-w-0 items-start gap-4">
						<div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-kumo-warning-tint/70 text-kumo-warning">
							<FlagBannerIcon size={24} weight="duotone" />
						</div>
						<div className="min-w-0">
							<div className="flex flex-wrap items-center gap-2">
								<h1 className="truncate text-xl font-semibold text-kumo-default">
									{bindingName ?? appId}
								</h1>
								<Badge variant="beta">Local</Badge>
							</div>
							<div className="group/cell mt-1 flex items-center gap-1.5">
								<span className="text-sm text-kumo-subtle">App ID</span>
								<code className="font-mono text-xs text-kumo-default">
									{appId}
								</code>
								<CopyButton text={appId} />
							</div>
							<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-kumo-subtle">
								<span>
									<strong className="font-medium text-kumo-default">
										{flags.length}
									</strong>{" "}
									{flags.length === 1 ? "flag" : "flags"}
								</span>
								<span>
									<strong className="font-medium text-kumo-default">
										{enabledCount}
									</strong>{" "}
									enabled
								</span>
								<span>
									<strong className="font-medium text-kumo-default">
										{ruleCount}
									</strong>{" "}
									{ruleCount === 1 ? "rule" : "rules"}
								</span>
							</div>
						</div>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<Button
							disabled={flags.length === 0}
							icon={FlaskIcon}
							onClick={() => openTest()}
							variant="secondary"
						>
							Test flag
						</Button>
						<Button icon={PlusIcon} onClick={() => setCreating(true)}>
							Create flag
						</Button>
					</div>
				</header>

				{flags.length === 0 ? (
					<div className="overflow-hidden rounded-xl border border-kumo-fill bg-kumo-base">
						<Empty
							contents={
								<div className="flex items-center gap-2">
									<Button icon={PlusIcon} onClick={() => setCreating(true)}>
										Create flag
									</Button>
									<Button onClick={() => void refresh()} variant="secondary">
										Refresh
									</Button>
								</div>
							}
							description="Create a local flag, or pull the flags from your remote app with Wrangler."
							icon={<FlagBannerIcon size={36} />}
							title="No feature flags yet"
						/>
						<div className="border-t border-kumo-fill bg-kumo-elevated px-5 py-3 text-center text-xs text-kumo-subtle">
							<code className="font-mono text-kumo-default">
								wrangler flagship flags pull {appId}
							</code>
						</div>
					</div>
				) : (
					<section>
						<div className="mb-3 flex items-center gap-2">
							<InputGroup className="max-w-105 flex-1" size="sm">
								<div className="flex items-center pl-2 text-kumo-subtle">
									<MagnifyingGlassIcon size={14} />
								</div>
								<input
									aria-label="Search flags"
									className="w-full bg-transparent px-2 text-xs text-kumo-default outline-none placeholder:text-kumo-subtle"
									onChange={(event) => setQuery(event.target.value)}
									placeholder="Search by key or description"
									value={query}
								/>
								{query ? (
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
							<RefreshButton
								aria-label="Refresh flags"
								loading={refreshing}
								onClick={() => void refresh()}
								size="sm"
							/>
						</div>

						{filteredFlags.length === 0 ? (
							<div className="rounded-lg border border-kumo-fill bg-kumo-elevated px-5 py-8 text-center text-sm text-kumo-subtle">
								No flags found
							</div>
						) : (
							<FlagTable
								flags={filteredFlags}
								onDelete={setDeleteTarget}
								onTest={openTest}
								onToggle={(flag) => void toggleFlag(flag)}
								pendingKey={pendingKey}
							/>
						)}
					</section>
				)}
			</div>

			<CreateFlagDialog
				appId={appId}
				existingKeys={flags.flatMap((flag) =>
					flag.key === undefined ? [] : [flag.key]
				)}
				onCreated={refresh}
				onOpenChange={setCreating}
				open={creating}
			/>

			<TestFlagDialog
				appId={appId}
				flags={flags}
				initialFlagKey={initialTestKey}
				onOpenChange={(open) => {
					if (!open) {
						setTesting(false);
					}
				}}
				open={testing}
			/>

			<Dialog.Root
				onOpenChange={(open: boolean) => {
					if (!open) {
						setDeleteTarget(null);
					}
				}}
				open={deleteTarget !== null}
			>
				<Dialog className="p-6">
					{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
					<Dialog.Title className="mb-4 text-lg font-semibold">
						Delete flag
					</Dialog.Title>
					{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
					<Dialog.Description className="mb-2 text-kumo-subtle">
						This will permanently delete{" "}
						<span className="font-mono text-kumo-default">
							{deleteTarget?.key}
						</span>{" "}
						and all its targeting rules. This cannot be undone.
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
		</>
	);
}
