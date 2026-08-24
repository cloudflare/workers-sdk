import {
	Badge,
	Banner,
	Button,
	Dialog,
	Label,
	Select,
	SkeletonLine,
} from "@cloudflare/kumo";
import {
	CheckIcon,
	CopyIcon,
	FlagBannerIcon,
	PlusIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { flagshipEvaluateFlag } from "../../api";
import { LOCAL_EXPLORER_API_PATH } from "../../constants";
import { flagshipErrorMessage, shellQuote } from "./flag-helpers";
import { TextInput } from "./FormFields";
import type { FlagshipEvaluation, FlagshipFlag } from "../../api";
import type { BadgeVariant } from "@cloudflare/kumo";
import type { JSX } from "react";

type EvaluationReason = NonNullable<FlagshipEvaluation["reason"]>;

const REASON_VARIANTS: Record<EvaluationReason, BadgeVariant> = {
	DEFAULT: "secondary",
	DISABLED: "warning",
	ERROR: "error",
	SPLIT: "info",
	TARGETING_MATCH: "success",
};

interface ContextRow {
	id: string;
	key: string;
	value: string;
}

interface TestFlagDialogProps {
	appId: string;
	flags: FlagshipFlag[];
	initialFlagKey: string | null;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}

/**
 * Converts editable context rows into the record sent to the evaluate endpoint.
 *
 * @returns A context record with blank keys removed
 */
function contextFromRows(rows: ContextRow[]): Record<string, string> {
	const context: Record<string, string> = {};
	for (const row of rows) {
		const key = row.key.trim();
		if (key !== "") {
			context[key] = row.value.trim();
		}
	}
	return context;
}

/**
 * Builds a cURL command that reproduces the evaluation against the local API.
 */
function localEvaluateCurl(
	appId: string,
	flagKey: string,
	context: Record<string, string>
): string {
	const origin = window.location.origin;
	const url = `${origin}${LOCAL_EXPLORER_API_PATH}/flagship/apps/${encodeURIComponent(appId)}/flags/${encodeURIComponent(flagKey)}/evaluate`;
	return [
		`curl -X POST ${shellQuote(url)} \\`,
		`  -H 'Content-Type: application/json' \\`,
		`  -d ${shellQuote(JSON.stringify({ context }))}`,
	].join("\n");
}

/**
 * Renders a flag value the way the Worker would receive it.
 */
function formatResultValue(value: unknown): string {
	if (value === undefined) {
		return "undefined";
	}
	if (typeof value === "string") {
		return value;
	}
	return JSON.stringify(value);
}

/**
 * Renders the heading for the result pane.
 *
 * This is deliberately not a `Label`: the pane shows output rather than a form
 * control, so a `label` element would have nothing to describe.
 */
function ResultHeading(): JSX.Element {
	return (
		<h3 className="text-sm font-medium text-kumo-default">Evaluation result</h3>
	);
}

/**
 * Renders placeholder lines while an evaluation is in flight.
 */
function ResultSkeleton(): JSX.Element {
	return (
		<div className="flex flex-col gap-4 p-5">
			<ResultHeading />
			<div className="flex flex-col gap-2.5">
				<SkeletonLine maxWidth={30} minWidth={20} />
				<SkeletonLine maxWidth={80} minWidth={60} />
				<SkeletonLine maxWidth={60} minWidth={40} />
				<SkeletonLine maxWidth={70} minWidth={50} />
			</div>
		</div>
	);
}

/**
 * Renders the dialog used to evaluate a flag against an ad-hoc context.
 */
export function TestFlagDialog({
	appId,
	flags,
	initialFlagKey,
	onOpenChange,
	open,
}: TestFlagDialogProps): JSX.Element {
	const flagKeys = useMemo(
		() => flags.flatMap((flag) => (flag.key === undefined ? [] : [flag.key])),
		[flags]
	);
	const defaultFlagKey = initialFlagKey ?? flagKeys[0] ?? "";

	const [selectedFlagKey, setSelectedFlagKey] = useState(defaultFlagKey);
	const [rows, setRows] = useState<ContextRow[]>([]);
	const [result, setResult] = useState<FlagshipEvaluation | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [evaluating, setEvaluating] = useState(false);
	const [copied, setCopied] = useState<"result" | "curl" | null>(null);
	const wasOpen = useRef(false);
	const latestRequest = useRef(0);
	const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		// Seed only on open, so a background refresh cannot discard the selection.
		if (open && !wasOpen.current) {
			setSelectedFlagKey(defaultFlagKey);
		}
		wasOpen.current = open;
	}, [defaultFlagKey, open]);

	useEffect(() => {
		return () => {
			if (copyTimeout.current !== null) {
				clearTimeout(copyTimeout.current);
			}
		};
	}, []);

	/**
	 * Clears the transient state so the next open starts from a clean form.
	 */
	function reset(): void {
		latestRequest.current += 1;
		setRows([]);
		setResult(null);
		setError(null);
		setEvaluating(false);
		setCopied(null);
	}

	/**
	 * Resets the form when the dialog closes and forwards the new state.
	 */
	function handleOpenChange(next: boolean): void {
		if (!next) {
			reset();
		}
		onOpenChange(next);
	}

	/**
	 * Evaluates the selected flag with the context entered in the form.
	 */
	async function evaluate(): Promise<void> {
		if (selectedFlagKey === "" || evaluating) {
			return;
		}
		const request = ++latestRequest.current;
		setEvaluating(true);
		setError(null);
		setResult(null);
		try {
			const response = await flagshipEvaluateFlag({
				body: { context: contextFromRows(rows) },
				path: { app_id: appId, flag_key: selectedFlagKey },
			});
			if (request !== latestRequest.current) {
				return;
			}
			const next = response.data?.result;
			if (next === undefined) {
				setError("The flag evaluated but no result was returned.");
				return;
			}
			setResult(next);
		} catch (caught) {
			if (request === latestRequest.current) {
				setError(flagshipErrorMessage(caught, "Failed to evaluate flag"));
			}
		} finally {
			if (request === latestRequest.current) {
				setEvaluating(false);
			}
		}
	}

	/**
	 * Copies a value to the clipboard and flashes the confirmation icon.
	 */
	async function copy(kind: "result" | "curl", value: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(value);
		} catch {
			return;
		}
		setCopied(kind);
		if (copyTimeout.current !== null) {
			clearTimeout(copyTimeout.current);
		}
		copyTimeout.current = setTimeout(() => setCopied(null), 1500);
	}

	/**
	 * Updates a single field of a context row.
	 */
	function updateRow(id: string, patch: Partial<ContextRow>): void {
		setRows((current) =>
			current.map((row) => (row.id === id ? { ...row, ...patch } : row))
		);
	}

	const curl = localEvaluateCurl(appId, selectedFlagKey, contextFromRows(rows));
	const resultJson = result === null ? "" : JSON.stringify(result, null, 2);

	return (
		<Dialog.Root onOpenChange={handleOpenChange} open={open}>
			<Dialog
				className="flex max-h-[calc(100vh-4rem)] flex-col overflow-hidden p-0"
				size="xl"
				style={{ width: "min(52rem, calc(100vw - 2rem))" }}
			>
				<div className="px-6 py-5">
					{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
					<Dialog.Title className="text-lg font-semibold text-kumo-default">
						Test a flag
					</Dialog.Title>
					<p className="mt-1 text-sm text-kumo-subtle">
						Runs the same evaluation your Worker performs through its Flagship
						binding.
					</p>
				</div>

				<div className="grid min-h-80 grid-cols-1 border-y border-kumo-fill md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
					<div className="flex flex-col gap-5 overflow-y-auto border-b border-kumo-fill px-6 py-5 md:border-r md:border-b-0">
						<Select
							className="w-full"
							items={flagKeys.map((key) => ({ label: key, value: key }))}
							label="Flag key"
							onValueChange={(value: string | null) => {
								latestRequest.current += 1;
								setSelectedFlagKey(value ?? "");
								setResult(null);
								setError(null);
								setEvaluating(false);
							}}
							placeholder="Select a flag"
							value={selectedFlagKey}
						>
							{flagKeys.map((key) => (
								<Select.Option key={key} value={key}>
									<span className="font-mono text-sm">{key}</span>
								</Select.Option>
							))}
						</Select>

						<div className="flex flex-col gap-3">
							<div>
								<Label>Evaluation context</Label>
								<p className="mt-1 text-xs text-kumo-subtle">
									Attributes your targeting rules can match on.
								</p>
							</div>

							{rows.map((row) => (
								<div
									className="flex flex-col overflow-hidden rounded-lg ring ring-kumo-line focus-within:ring-kumo-hairline"
									key={row.id}
								>
									<div className="flex items-center border-b border-kumo-fill">
										<TextInput
											ariaLabel="Context key"
											className="rounded-none ring-0 focus:ring-0"
											onEnter={() => void evaluate()}
											onValueChange={(value) =>
												updateRow(row.id, { key: value })
											}
											placeholder="Enter key"
											value={row.key}
										/>
										<Button
											aria-label="Remove attribute"
											className="text-kumo-subtle hover:text-kumo-default"
											icon={TrashIcon}
											onClick={() =>
												setRows((current) =>
													current.filter((item) => item.id !== row.id)
												)
											}
											shape="square"
											variant="ghost"
										/>
									</div>
									<TextInput
										ariaLabel="Context value"
										className="rounded-none ring-0 focus:ring-0"
										mono
										onEnter={() => void evaluate()}
										onValueChange={(value) => updateRow(row.id, { value })}
										placeholder="Enter value"
										value={row.value}
									/>
								</div>
							))}

							<Button
								icon={<PlusIcon size={14} />}
								onClick={() =>
									setRows((current) => [
										...current,
										{ id: crypto.randomUUID(), key: "", value: "" },
									])
								}
								size="sm"
								variant="secondary"
							>
								Add attribute
							</Button>
						</div>
					</div>

					<div className="flex min-h-72 flex-col overflow-y-auto bg-kumo-elevated">
						{evaluating ? (
							<ResultSkeleton />
						) : error !== null ? (
							<div className="p-5">
								<Banner
									description={error}
									title="Evaluation failed"
									variant="error"
								/>
							</div>
						) : result !== null ? (
							<div className="flex min-h-0 flex-1 flex-col gap-3 p-5">
								<div className="flex items-center justify-between">
									<ResultHeading />
									<Button
										aria-label="Copy result"
										icon={copied === "result" ? CheckIcon : CopyIcon}
										onClick={() => void copy("result", resultJson)}
										shape="square"
										size="sm"
										variant="ghost"
									/>
								</div>

								<div className="rounded-lg border border-kumo-fill bg-kumo-base p-3">
									<p className="text-xs text-kumo-subtle">Value</p>
									<p className="mt-1 font-mono text-sm break-all text-kumo-default">
										{formatResultValue(result.value)}
									</p>
									<div className="mt-3 flex flex-wrap items-center gap-1.5">
										{result.variant === undefined ? null : (
											<Badge className="font-mono" variant="outline">
												{result.variant}
											</Badge>
										)}
										{result.reason === undefined ? null : (
											<Badge variant={REASON_VARIANTS[result.reason]}>
												{result.reason}
											</Badge>
										)}
									</div>
								</div>

								<pre className="min-h-0 flex-1 overflow-auto rounded-lg border border-kumo-fill bg-kumo-base p-3 font-mono text-xs leading-5 text-kumo-subtle">
									{resultJson}
								</pre>
							</div>
						) : (
							<div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
								<FlagBannerIcon
									className="text-kumo-subtle"
									size={36}
									weight="duotone"
								/>
								<p className="text-sm font-medium text-kumo-default">
									No evaluation yet
								</p>
								<p className="max-w-64 text-xs text-kumo-subtle">
									Evaluate the flag to see the value, variant, and reason your
									Worker receives.
								</p>
							</div>
						)}
					</div>
				</div>

				<div className="flex items-center justify-end gap-2 px-6 py-5">
					<Button
						disabled={selectedFlagKey === ""}
						icon={copied === "curl" ? CheckIcon : CopyIcon}
						onClick={() => void copy("curl", curl)}
						variant="secondary"
					>
						cURL
					</Button>
					<Button onClick={() => handleOpenChange(false)} variant="secondary">
						Dismiss
					</Button>
					<Button
						disabled={evaluating || selectedFlagKey === ""}
						loading={evaluating}
						onClick={() => void evaluate()}
						variant="primary"
					>
						Evaluate
					</Button>
				</div>
			</Dialog>
		</Dialog.Root>
	);
}
