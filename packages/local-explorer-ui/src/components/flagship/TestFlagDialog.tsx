import { Badge, Banner, Button, Dialog, Label, Select } from "@cloudflare/kumo";
import { FlagBannerIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { flagshipEvaluateFlag } from "../../api";
import { flagshipErrorMessage, parseContextValue } from "./flag-helpers";
import { TextInput } from "./FormFields";
import type { FlagshipEvaluation, FlagshipFlag } from "../../api";
import type { BadgeVariant } from "@cloudflare/kumo";
import type { JSX } from "react";

interface ContextEntry {
	id: string;
	key: string;
	value: string;
}

function newContextEntry(): ContextEntry {
	return { id: crypto.randomUUID(), key: "", value: "" };
}

type EvaluationReason = NonNullable<FlagshipEvaluation["reason"]>;

const REASON_VARIANTS: Record<EvaluationReason, BadgeVariant> = {
	DEFAULT: "secondary",
	DISABLED: "warning",
	ERROR: "error",
	SPLIT: "info",
	TARGETING_MATCH: "success",
};

interface TestFlagDialogProps {
	appId: string;
	flags: FlagshipFlag[];
	initialFlagKey: string | null;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	worker?: string;
}

function formatResultValue(value: unknown): string {
	return typeof value === "string" ? value : JSON.stringify(value);
}

export function TestFlagDialog({
	appId,
	flags,
	initialFlagKey,
	onOpenChange,
	open,
	worker,
}: TestFlagDialogProps): JSX.Element {
	const flagKeys = useMemo(() => flags.map(({ key }) => key), [flags]);
	const flagKeyItems = useMemo(
		() => Object.fromEntries(flagKeys.map((key) => [key, key])),
		[flagKeys]
	);
	const defaultFlagKey = initialFlagKey ?? flagKeys[0] ?? "";
	const [selectedFlagKey, setSelectedFlagKey] = useState(defaultFlagKey);
	const [context, setContext] = useState<ContextEntry[]>([]);
	const [result, setResult] = useState<FlagshipEvaluation | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [evaluating, setEvaluating] = useState(false);
	const wasOpen = useRef(false);
	const requestId = useRef(0);

	useEffect(() => {
		if (open && !wasOpen.current) {
			requestId.current += 1;
			setSelectedFlagKey(defaultFlagKey);
			setContext([]);
			setResult(null);
			setError(null);
			setEvaluating(false);
		}
		wasOpen.current = open;
	}, [defaultFlagKey, open]);

	function updateContext(id: string, patch: Partial<ContextEntry>): void {
		setContext((current) =>
			current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
		);
	}

	async function evaluate(): Promise<void> {
		if (selectedFlagKey === "" || evaluating) {
			return;
		}
		const attributes: Record<string, unknown> = {};
		for (const entry of context) {
			const key = entry.key.trim();
			if (key !== "") {
				attributes[key] = parseContextValue(entry.value).value;
			}
		}

		const currentRequest = ++requestId.current;
		setEvaluating(true);
		setError(null);
		setResult(null);
		try {
			const response = await flagshipEvaluateFlag({
				body: { context: attributes },
				path: { app_id: appId, flag_key: selectedFlagKey },
				query: { worker },
			});
			if (requestId.current !== currentRequest) {
				return;
			}
			setResult(response.data?.result ?? null);
			if (response.data?.result === undefined) {
				setError("The flag evaluated but no result was returned.");
			}
		} catch (caught) {
			if (requestId.current === currentRequest) {
				setError(flagshipErrorMessage(caught, "Failed to evaluate flag"));
			}
		} finally {
			if (requestId.current === currentRequest) {
				setEvaluating(false);
			}
		}
	}

	function handleOpenChange(next: boolean): void {
		if (!next) {
			requestId.current += 1;
			setEvaluating(false);
		}
		onOpenChange(next);
	}

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
					<div className="flex min-h-0 flex-col gap-5 overflow-y-auto border-b border-kumo-fill px-6 py-5 md:border-r md:border-b-0">
						<Select
							className="w-full"
							items={flagKeyItems}
							label="Flag key"
							onValueChange={(value: string | null) => {
								requestId.current += 1;
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

						<div className="flex flex-col gap-2">
							<Label>Evaluation context</Label>
							<p className="text-xs text-kumo-subtle">
								Attributes your targeting rules read, such as
								<span className="font-mono"> targetingKey</span> or
								<span className="font-mono"> plan</span>. Numbers, booleans and
								JSON are sent as typed values; quote a value to force a string.
							</p>
							{context.map((entry) => {
								const { type } = parseContextValue(entry.value);
								return (
									<div className="flex items-start gap-2" key={entry.id}>
										<TextInput
											ariaLabel="Context attribute"
											className="min-w-0 flex-1"
											mono
											onValueChange={(key) => updateContext(entry.id, { key })}
											placeholder="attribute"
											value={entry.key}
										/>
										<div className="flex min-w-0 flex-1 flex-col gap-1">
											<TextInput
												ariaLabel="Context value"
												mono
												onEnter={() => void evaluate()}
												onValueChange={(value) =>
													updateContext(entry.id, { value })
												}
												placeholder="value"
												value={entry.value}
											/>
											{type === "string" ? null : (
												<span className="text-xs text-kumo-subtle">
													sent as {type}
												</span>
											)}
										</div>
										<Button
											aria-label={`Remove ${entry.key || "attribute"}`}
											className="text-kumo-subtle hover:text-kumo-danger"
											icon={<TrashIcon size={14} />}
											onClick={() =>
												setContext((current) =>
													current.filter((row) => row.id !== entry.id)
												)
											}
											shape="square"
											variant="ghost"
										/>
									</div>
								);
							})}
							<Button
								className="self-start"
								icon={<PlusIcon size={14} />}
								onClick={() =>
									setContext((current) => [...current, newContextEntry()])
								}
								size="sm"
								variant="secondary"
							>
								Add attribute
							</Button>
						</div>
					</div>

					<div className="flex min-h-72 flex-col bg-kumo-elevated p-5">
						{error !== null ? (
							<Banner
								description={error}
								title="Evaluation failed"
								variant="error"
							/>
						) : result !== null ? (
							<div className="flex flex-col gap-3">
								<h3 className="text-sm font-medium text-kumo-default">
									Evaluation result
								</h3>
								<div className="rounded-lg border border-kumo-fill bg-kumo-base p-3">
									<p className="text-xs text-kumo-subtle">Value</p>
									<p className="mt-1 font-mono text-sm break-all text-kumo-default">
										{formatResultValue(result.value)}
									</p>
									<div className="mt-3 flex flex-wrap items-center gap-1.5">
										<Badge className="font-mono" variant="outline">
											{result.variant}
										</Badge>
										<Badge variant={REASON_VARIANTS[result.reason]}>
											{result.reason}
										</Badge>
									</div>
								</div>
							</div>
						) : (
							<div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
								<FlagBannerIcon
									className="text-kumo-subtle"
									size={36}
									weight="duotone"
								/>
								<p className="text-sm font-medium text-kumo-default">
									No evaluation yet
								</p>
							</div>
						)}
					</div>
				</div>

				<div className="flex justify-end gap-2 px-6 py-5">
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
