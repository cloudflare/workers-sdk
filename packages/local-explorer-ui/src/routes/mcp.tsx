import { Checkbox, cn, Switch } from "@cloudflare/kumo";
import {
	ArrowsCounterClockwiseIcon,
	CaretDownIcon,
	CaretRightIcon,
	CheckIcon,
	CopyIcon,
	PlugsConnectedIcon,
	RobotIcon,
	ShieldCheckIcon,
} from "@phosphor-icons/react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import D1Icon from "../assets/icons/d1.svg?react";
import DOIcon from "../assets/icons/durable-objects.svg?react";
import KVIcon from "../assets/icons/kv.svg?react";
import R2Icon from "../assets/icons/r2.svg?react";
import {
	LOG_LEVELS,
	listMcpCalls,
	loadMcpConfig,
	resourceKey,
	saveMcpConfig,
	saveMcpConfigToDb,
	type LogLevel,
	type McpAccessConfig,
	type McpCallRow,
} from "../lib/mcp";
import { findTraceDatabaseId } from "../lib/traces";
import type { FC, ReactNode } from "react";

export const Route = createFileRoute("/mcp")({
	component: McpView,
	validateSearch: (search): { worker?: string } => ({
		worker: typeof search.worker === "string" ? search.worker : undefined,
	}),
});

const rootRoute = getRouteApi("__root__");

type ResourceType = "d1" | "do" | "kv" | "r2";

interface ResourceItem {
	type: ResourceType;
	id: string;
	label: string;
}

const RESOURCE_META: Record<
	ResourceType,
	{ title: string; icon: FC<{ className?: string }> }
> = {
	d1: { title: "D1 Databases", icon: D1Icon },
	do: { title: "Durable Objects", icon: DOIcon },
	kv: { title: "KV Namespaces", icon: KVIcon },
	r2: { title: "R2 Buckets", icon: R2Icon },
};

function levelDotClass(level: string): string {
	switch (level) {
		case "error":
			return "bg-red-500";
		case "warn":
			return "bg-amber-500";
		case "debug":
			return "bg-gray-400";
		default:
			return "bg-blue-500";
	}
}

function McpView(): JSX.Element {
	const rootData = rootRoute.useLoaderData();

	const [config, setConfig] = useState<McpAccessConfig>(loadMcpConfig);

	const update = useCallback((next: McpAccessConfig) => {
		setConfig(next);
		saveMcpConfig(next);
	}, []);

	const toggleLevel = useCallback(
		(lvl: LogLevel) =>
			update({
				...config,
				logLevels: { ...config.logLevels, [lvl]: !config.logLevels[lvl] },
			}),
		[config, update]
	);

	const toggleResource = useCallback(
		(key: string) =>
			update({
				...config,
				resources: { ...config.resources, [key]: !config.resources[key] },
			}),
		[config, update]
	);

	const toggleRawFetch = useCallback(
		() => update({ ...config, allowRawFetch: !config.allowRawFetch }),
		[config, update]
	);

	const resources = useMemo(() => {
		const out: ResourceItem[] = [];
		const seen = new Set<string>();
		const add = (type: ResourceType, id: string, label: string) => {
			const k = resourceKey(type, id);
			if (!seen.has(k)) {
				seen.add(k);
				out.push({ type, id, label });
			}
		};
		for (const w of rootData.workers) {
			const b = w.bindings;
			for (const d of b?.d1 ?? []) {
				add("d1", d.id, d.bindingName);
			}
			for (const ns of b?.do ?? []) {
				add("do", ns.id, ns.className);
			}
			for (const ns of b?.kv ?? []) {
				add("kv", ns.id, ns.bindingName);
			}
			for (const r of b?.r2 ?? []) {
				add("r2", r.id, r.bindingName);
			}
		}
		return out;
	}, [rootData.workers]);

	const resourcesByType = useMemo(() => {
		const groups: Record<ResourceType, ResourceItem[]> = {
			d1: [],
			do: [],
			kv: [],
			r2: [],
		};
		for (const r of resources) {
			groups[r.type].push(r);
		}
		return groups;
	}, [resources]);

	const grantedCount = resources.filter(
		(r) => config.resources[resourceKey(r.type, r.id)]
	).length;

	// ---- call history -------------------------------------------------------
	const databaseId = useMemo(() => {
		for (const w of rootData.workers) {
			const id = findTraceDatabaseId(w.bindings);
			if (id) {
				return id;
			}
		}
		return undefined;
	}, [rootData.workers]);

	const [calls, setCalls] = useState<McpCallRow[]>([]);
	const [loading, setLoading] = useState(false);
	const [expanded, setExpanded] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		if (!databaseId) {
			return;
		}
		setLoading(true);
		try {
			setCalls(await listMcpCalls(databaseId));
		} catch {
			setCalls([]);
		} finally {
			setLoading(false);
		}
	}, [databaseId]);

	useEffect(() => {
		void refresh();
		const id = setInterval(() => void refresh(), 3000);
		return () => clearInterval(id);
	}, [refresh]);

	// mirror the config into the trace D1 so the MCP server (a separate process)
	// can read and enforce it
	useEffect(() => {
		if (databaseId) {
			void saveMcpConfigToDb(databaseId, config).catch(() => {});
		}
	}, [databaseId, config]);

	return (
		<div className="flex h-full flex-col">
			<header className="flex min-h-14 items-center gap-2.5 border-b border-kumo-fill px-4">
				<RobotIcon size={18} className="text-kumo-subtle" />
				<div className="flex flex-col">
					<h2 className="text-sm leading-tight font-semibold text-kumo-default">
						MCP
					</h2>
					<span className="text-[11px] leading-tight text-kumo-subtle">
						Agent access control
					</span>
				</div>
			</header>

			<div className="mx-auto flex w-full max-w-3xl flex-col gap-5 overflow-y-auto p-5">
				<p className="text-xs leading-relaxed text-kumo-subtle">
					<span className="font-medium text-kumo-default">Optional.</span> The
					recommended way to let an agent inspect local traces and logs is the{" "}
					<code className="rounded bg-kumo-tint px-1 py-0.5 font-mono text-[11px]">
						wrangler observability
					</code>{" "}
					CLI — no setup, and it works whether or not the dev server is running
					(run <code className="font-mono">wrangler observability skill</code>{" "}
					to point an agent at it). MCP is an alternative for agents that would
					rather connect over MCP than run CLI commands. These settings control
					what a connected agent may access — and every request it makes is
					logged below.
				</p>

				<ConnectCard />

				{/* Log levels */}
				<Card
					title="Log level access"
					description="Which log levels the agent can read. Turn off levels that may contain sensitive output."
				>
					<div className="flex flex-wrap gap-x-6 gap-y-3">
						{LOG_LEVELS.map((lvl) => (
							<label
								key={lvl}
								className="flex cursor-pointer items-center gap-2"
							>
								<Checkbox
									checked={config.logLevels[lvl]}
									onCheckedChange={() => toggleLevel(lvl)}
									aria-label={lvl}
								/>
								<span
									className={cn(
										"h-2 w-2 shrink-0 rounded-full",
										levelDotClass(lvl)
									)}
								/>
								<span className="text-xs text-kumo-default capitalize">
									{lvl}
								</span>
							</label>
						))}
					</div>
				</Card>

				{/* Resource access */}
				<Card
					title="Data access"
					description="Grant the agent access to specific bindings. Off by default — these may hold sensitive data."
					action={
						resources.length > 0 ? (
							<span className="text-[11px] text-kumo-subtle">
								{grantedCount} of {resources.length} granted
							</span>
						) : undefined
					}
				>
					{resources.length === 0 ? (
						<p className="text-xs text-kumo-subtle italic">
							No D1, Durable Object, KV, or R2 bindings found for this project.
						</p>
					) : (
						<div className="flex flex-col gap-4">
							{(Object.keys(RESOURCE_META) as ResourceType[]).map((type) => {
								const items = resourcesByType[type];
								if (items.length === 0) {
									return null;
								}
								const Meta = RESOURCE_META[type];
								return (
									<div key={type}>
										<div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-kumo-subtle uppercase">
											<Meta.icon className="h-3.5 w-3.5" />
											{Meta.title}
										</div>
										<div className="divide-y divide-kumo-fill rounded-md border border-kumo-fill">
											{items.map((r) => {
												const key = resourceKey(r.type, r.id);
												const allowed = !!config.resources[key];
												return (
													<div
														key={key}
														className="flex items-center justify-between gap-3 px-3 py-2"
													>
														<span className="font-mono text-xs text-kumo-default">
															{r.label}
														</span>
														<Switch
															checked={allowed}
															onCheckedChange={() => toggleResource(key)}
															aria-label={`Allow access to ${r.label}`}
															size="sm"
														/>
													</div>
												);
											})}
										</div>
									</div>
								);
							})}
						</div>
					)}
				</Card>

				<Card
					title="Advanced access"
					description="Raw Explorer API access lets the agent call any Local Explorer route through cf.fetch(). Keep this off unless you explicitly want to bypass the typed D1/KV/R2/DO controls above."
				>
					<div className="flex items-center justify-between gap-3">
						<div>
							<p className="text-xs font-medium text-kumo-default">
								Allow raw Explorer API access
							</p>
							<p className="mt-0.5 text-[11px] text-kumo-subtle">
								Controls the Codemode MCP <code className="font-mono">cf.fetch()</code> escape hatch.
							</p>
						</div>
						<Switch
							checked={config.allowRawFetch}
							onCheckedChange={toggleRawFetch}
							aria-label="Allow raw Explorer API access"
							size="sm"
						/>
					</div>
				</Card>

				{/* Call history */}
				<Card
					title="Agent activity"
					description="What the agent requested and what was returned."
					action={
						<button
							type="button"
							onClick={() => void refresh()}
							className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default"
						>
							<ArrowsCounterClockwiseIcon
								size={13}
								className={loading ? "animate-spin" : undefined}
							/>
							Refresh
						</button>
					}
				>
					{calls.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-10 text-center">
							<ShieldCheckIcon size={26} className="mb-2 text-kumo-subtle" />
							<p className="text-xs font-medium text-kumo-default">
								No agent activity yet
							</p>
							<p className="mt-1 max-w-sm text-xs text-kumo-subtle">
								When an agent connects over MCP and makes a request, every call
								it makes — and the response it got — will appear here.
							</p>
						</div>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full border-collapse text-sm">
								<thead>
									<tr className="border-b border-kumo-fill text-left text-xs text-kumo-subtle">
										<th className="w-6 py-2 pl-1 font-medium" />
										<th className="w-40 py-2 pr-3 font-medium">Time</th>
										<th className="w-40 py-2 pr-3 font-medium">Tool</th>
										<th className="py-2 pr-3 font-medium">Request</th>
										<th className="w-20 py-2 pr-3 font-medium">Status</th>
									</tr>
								</thead>
								<tbody>
									{calls.map((c) => {
										const key = String(c.id);
										const isOpen = expanded === key;
										return (
											<Fragment key={key}>
												<tr
													onClick={() => setExpanded(isOpen ? null : key)}
													className="cursor-pointer border-b border-kumo-fill align-top hover:bg-black/[0.03] dark:hover:bg-white/5"
												>
													<td className="py-2 pl-1 text-xs text-kumo-subtle">
														{isOpen ? (
															<CaretDownIcon size={12} />
														) : (
															<CaretRightIcon size={12} />
														)}
													</td>
													<td className="py-2 pr-3 font-mono text-[11px] text-kumo-subtle">
														{c.created_at ?? ""}
													</td>
													<td className="py-2 pr-3 font-mono text-xs text-kumo-default">
														{c.tool ?? "-"}
													</td>
													<td className="max-w-[18rem] truncate py-2 pr-3 font-mono text-[11px] text-kumo-subtle">
														{c.args ?? ""}
													</td>
													<td className="py-2 pr-3 text-xs">
														<span
															className={cn(
																"rounded px-1.5 py-0.5 text-[10px] font-medium",
																c.status === "error"
																	? "bg-red-500/15 text-red-500"
																	: c.status === "denied"
																		? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
																		: "bg-green-500/15 text-green-600 dark:text-green-400"
															)}
														>
															{c.status ?? "ok"}
														</span>
													</td>
												</tr>
												{isOpen ? (
													<tr className="bg-black/[0.02] dark:bg-white/[0.02]">
														<td colSpan={5} className="px-4 py-3">
															<div className="flex flex-col gap-3">
																<DetailBlock label="Request" value={c.args} />
																<DetailBlock
																	label="Response"
																	value={c.result}
																/>
															</div>
														</td>
													</tr>
												) : null}
											</Fragment>
										);
									})}
								</tbody>
							</table>
						</div>
					)}
				</Card>
			</div>
		</div>
	);
}

type AgentId = "opencode" | "claude" | "cursor";

const AGENTS: Array<{ id: AgentId; label: string }> = [
	{ id: "opencode", label: "opencode" },
	{ id: "claude", label: "Claude Code" },
	{ id: "cursor", label: "Cursor" },
];

function connectSnippet(agent: AgentId, mcpUrl: string): string {
	switch (agent) {
		case "opencode":
			return JSON.stringify(
				{
					mcp: {
						"wobs-local": {
							type: "remote",
							url: mcpUrl,
							enabled: true,
						},
					},
				},
				null,
				2
			);
		case "claude":
			return `claude mcp add --transport http wobs-local ${mcpUrl}`;
		case "cursor":
			return JSON.stringify(
				{
					mcpServers: {
						"wobs-local": {
							type: "http",
							url: mcpUrl,
						},
					},
				},
				null,
				2
			);
	}
}

function cursorDeeplink(mcpUrl: string): string {
	const config = { type: "http", url: mcpUrl };
	const b64 = btoa(JSON.stringify(config));
	return `cursor://anysphere.cursor-deeplink/mcp/install?name=wobs-local&config=${b64}`;
}

function ConnectCard(): JSX.Element {
	const explorerUrl =
		typeof window !== "undefined"
			? window.location.origin
			: "http://localhost:8799";
	const mcpUrl = `${explorerUrl}/cdn-cgi/explorer/mcp`;
	const [agent, setAgent] = useState<AgentId>("opencode");
	const [copied, setCopied] = useState(false);

	const snippet = connectSnippet(agent, mcpUrl);

	const copy = useCallback(() => {
		void navigator.clipboard.writeText(snippet).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		});
	}, [snippet]);

	return (
		<Card
			title="Hosted Codemode MCP"
			description="Connect an agent to the Local Explorer MCP endpoint hosted by Miniflare. No separate Node server or install path required. The run tool gets a governed cf client for traces, logs, and any data bindings you allow below."
		>
			<div className="flex flex-col gap-3">
				<div className="flex items-center gap-2">
					<div className="inline-flex rounded-md border border-kumo-fill p-0.5">
						{AGENTS.map((a) => (
							<button
								key={a.id}
								type="button"
								onClick={() => setAgent(a.id)}
								className={cn(
									"cursor-pointer rounded px-2.5 py-1 text-xs transition-colors",
									agent === a.id
										? "bg-kumo-tint text-kumo-default"
										: "text-kumo-subtle hover:text-kumo-default"
								)}
							>
								{a.label}
							</button>
						))}
					</div>
					{agent === "cursor" ? (
						<a
							href={cursorDeeplink(mcpUrl)}
							className="inline-flex items-center gap-1.5 rounded-md bg-blue-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
						>
							<PlugsConnectedIcon size={13} />
							Add to Cursor
						</a>
					) : null}
				</div>

				<div className="rounded-md border border-kumo-fill bg-kumo-elevated px-3 py-2">
					<div className="mb-1 text-[10px] font-medium tracking-wide text-kumo-subtle uppercase">
						Endpoint
					</div>
					<code className="font-mono text-[11px] break-all text-kumo-default">
						{mcpUrl}
					</code>
				</div>

				<div className="relative">
					<pre className="overflow-x-auto rounded-md border border-kumo-fill bg-kumo-elevated p-3 pr-10 font-mono text-[11px] leading-relaxed text-kumo-default">
						{snippet}
					</pre>
					<button
						type="button"
						onClick={copy}
						aria-label="Copy config"
						className="absolute top-2 right-2 rounded p-1 text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default"
					>
						{copied ? (
							<CheckIcon size={14} className="text-green-500" />
						) : (
							<CopyIcon size={14} />
						)}
					</button>
				</div>

				<p className="text-[11px] leading-relaxed text-kumo-subtle">
					{agent === "opencode"
						? "Paste into opencode.json (project or global), then restart opencode."
						: agent === "claude"
							? "Run the command above, then restart Claude Code and approve the HTTP MCP server."
							: "Click Add to Cursor, or paste the JSON into .cursor/mcp.json."}{" "}
					Requires this dev server to be running with Codemode MCP enabled
					(<code className="font-mono">X_LOCAL_OBSERVABILITY_MCP=true</code>).
				</p>
			</div>
		</Card>
	);
}

function prettyJson(value: string | null): string {
	if (!value) {
		return "—";
	}
	try {
		return JSON.stringify(JSON.parse(value), null, 2);
	} catch {
		return value;
	}
}

function DetailBlock({
	label,
	value,
}: {
	label: string;
	value: string | null;
}): JSX.Element {
	return (
		<div>
			<div className="mb-1 text-[10px] font-medium tracking-wide text-kumo-subtle uppercase">
				{label}
			</div>
			<pre className="max-h-72 overflow-auto rounded-md border border-kumo-fill bg-kumo-elevated p-2.5 font-mono text-[11px] leading-relaxed text-kumo-default">
				{prettyJson(value)}
			</pre>
		</div>
	);
}

function Card({
	title,
	description,
	action,
	children,
}: {
	title: string;
	description?: string;
	action?: ReactNode;
	children: ReactNode;
}): JSX.Element {
	return (
		<section className="rounded-lg border border-kumo-fill bg-kumo-base p-4">
			<div className="mb-3 flex items-start justify-between gap-3">
				<div>
					<h3 className="text-sm font-semibold text-kumo-default">{title}</h3>
					{description ? (
						<p className="mt-0.5 text-xs text-kumo-subtle">{description}</p>
					) : null}
				</div>
				{action}
			</div>
			{children}
		</section>
	);
}
