import { Button, Combobox, Dialog, Label, Text } from "@cloudflare/kumo";
import {
	CheckIcon,
	CopyIcon,
	FlagBannerIcon,
	PlusIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { flagshipEvaluateFlag } from "../../api";
import { flagshipErrorMessage } from "./flag-helpers";
import type { FlagshipEvaluation, FlagshipFlag } from "../../api";
import type { JSX } from "react";

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
 * Evaluate any flag in the app against a string-valued context.
 *
 * @param props The app, available flags, initial selection, and dialog state.
 * @returns The dialog element.
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
	const defaultFlagKey = useMemo(() => {
		if (initialFlagKey !== null) {
			return initialFlagKey;
		}
		return [...flags]
			.sort(
				(a, b) =>
					new Date(b.updated_at ?? 0).getTime() -
					new Date(a.updated_at ?? 0).getTime()
			)
			.at(0)?.key;
	}, [flags, initialFlagKey]);

	const [selectedFlagKey, setSelectedFlagKey] = useState<string | null>(null);
	const [rows, setRows] = useState<ContextRow[]>([]);
	const [result, setResult] = useState<FlagshipEvaluation | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [evaluating, setEvaluating] = useState(false);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (open) {
			setSelectedFlagKey(defaultFlagKey ?? null);
		}
	}, [defaultFlagKey, open]);

	function reset(): void {
		setRows([]);
		setResult(null);
		setError(null);
		setEvaluating(false);
		setCopied(false);
	}

	function handleOpenChange(next: boolean): void {
		if (!next) {
			reset();
		}
		onOpenChange(next);
	}

	async function evaluate(): Promise<void> {
		if (selectedFlagKey === null) {
			return;
		}
		setEvaluating(true);
		setError(null);
		setResult(null);
		try {
			const response = await flagshipEvaluateFlag({
				body: { context: contextFromRows(rows) },
				path: { app_id: appId, flag_key: selectedFlagKey },
			});
			const next = response.data?.result;
			if (next === undefined) {
				setError("The flag evaluated but no result was returned.");
				return;
			}
			setResult(next);
		} catch (caught) {
			setError(flagshipErrorMessage(caught, "Failed to evaluate flag"));
		} finally {
			setEvaluating(false);
		}
	}

	async function copyResult(): Promise<void> {
		if (result === null) {
			return;
		}
		await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}

	return (
		<Dialog.Root onOpenChange={handleOpenChange} open={open}>
			<Dialog
				className="flex max-h-[calc(100vh-64px)] flex-col overflow-hidden p-0"
				style={{ width: "min(800px, calc(100vw - 2rem))" }}
			>
				<div className="px-5 py-4">
					{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
					<Dialog.Title className="text-xl! font-medium! text-kumo-default">
						Test a flag
					</Dialog.Title>
				</div>

				<div className="grid min-h-75 grid-cols-1 border-t border-kumo-fill md:grid-cols-[360px_1fr]">
					<div className="flex flex-col gap-5 border-b border-kumo-fill px-5 py-5 md:border-r md:border-b-0">
						<Combobox
							items={flagKeys}
							label="Flag key"
							onValueChange={(value) => {
								setSelectedFlagKey(value);
								setResult(null);
								setError(null);
							}}
							required
							value={selectedFlagKey}
						>
							<Combobox.TriggerInput placeholder="Select a flag" />
							<Combobox.Content>
								<Combobox.Empty>No flags found.</Combobox.Empty>
								<Combobox.List>
									{(item) => (
										<Combobox.Item key={item} value={item}>
											{item}
										</Combobox.Item>
									)}
								</Combobox.List>
							</Combobox.Content>
						</Combobox>

						<div className="flex flex-col gap-3">
							<Text bold size="sm">
								Evaluation context
							</Text>
							{rows.length === 0 ? (
								<p className="text-xs text-kumo-subtle">
									No attributes. The flag will use its default evaluation path.
								</p>
							) : null}
							{rows.map((row) => (
								<div
									className="flex flex-col gap-px rounded-lg ring-1 ring-kumo-fill"
									key={row.id}
								>
									<div className="flex gap-px">
										<input
											aria-label="Context key"
											className="h-9 min-w-0 flex-1 rounded-tl-lg bg-kumo-base px-3 text-sm text-kumo-default outline-none hover:bg-kumo-elevated focus:bg-kumo-elevated"
											onChange={(event) =>
												setRows((current) =>
													current.map((item) =>
														item.id === row.id
															? { ...item, key: event.target.value }
															: item
													)
												)
											}
											placeholder="Enter key"
											value={row.key}
										/>
										<Button
											aria-label="Remove context entry"
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
									<input
										aria-label="Context value"
										className="h-9 rounded-b-lg bg-kumo-base px-3 text-sm text-kumo-default outline-none hover:bg-kumo-elevated focus:bg-kumo-elevated"
										onChange={(event) =>
											setRows((current) =>
												current.map((item) =>
													item.id === row.id
														? { ...item, value: event.target.value }
														: item
												)
											)
										}
										placeholder="Enter value"
										value={row.value}
									/>
								</div>
							))}
							<div>
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
									Add
								</Button>
							</div>
						</div>
					</div>

					<div className="min-h-75 overflow-auto bg-kumo-base p-1">
						{error !== null ? (
							<div className="flex flex-col gap-2 p-4">
								<Label className="text-kumo-danger">
									Error evaluating the flag
								</Label>
								<Text size="sm" variant="secondary">
									{error}
								</Text>
							</div>
						) : result === null ? (
							<div className="flex h-full min-h-70 flex-col items-center justify-center gap-2 text-center">
								<FlagBannerIcon className="text-kumo-fill" size={36} />
								<Text size="sm" variant="secondary">
									Evaluate a flag to see results
								</Text>
							</div>
						) : (
							<div className="flex h-full flex-col">
								<div className="flex items-center justify-between px-4 pt-3">
									<Label>Evaluation result</Label>
									<Button
										aria-label={copied ? "Copied" : "Copy result"}
										icon={copied ? CheckIcon : CopyIcon}
										onClick={() => void copyResult()}
										shape="square"
										size="sm"
										variant="ghost"
									/>
								</div>
								<pre className="m-3 flex-1 overflow-auto rounded-lg bg-kumo-elevated p-4 font-mono text-xs leading-5 text-kumo-default">
									{JSON.stringify(result, null, 2)}
								</pre>
							</div>
						)}
					</div>
				</div>

				<div className="flex items-center justify-between border-t border-kumo-fill px-5 py-4">
					<Button
						disabled={evaluating || selectedFlagKey === null}
						loading={evaluating}
						onClick={() => void evaluate()}
					>
						Evaluate
					</Button>
					<Button onClick={() => handleOpenChange(false)} variant="secondary">
						Dismiss
					</Button>
				</div>
			</Dialog>
		</Dialog.Root>
	);
}
