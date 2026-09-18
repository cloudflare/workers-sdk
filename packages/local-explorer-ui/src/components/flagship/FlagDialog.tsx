import {
	Badge,
	Banner,
	Button,
	Dialog,
	Label,
	Switch,
	Tabs,
	Tooltip,
} from "@cloudflare/kumo";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { flagshipCreateFlag, flagshipUpdateFlag } from "../../api";
import {
	alignSplits,
	canonicalRules,
	defaultServeToRules,
	defaultVariationsForType,
	FLAG_TYPE_LABELS,
	flagshipErrorMessage,
	inferDefaultServe,
	inferFlagType,
	parseVariationValue,
	ruleDraftsFrom,
	ruleDraftsToRules,
	sanitizeVariationName,
	validateDefaultServe,
	validateFlagKey,
	validateRuleDrafts,
	variationDraftsFrom,
	type DefaultServeDraft,
	type FlagType,
	type RuleDraft,
	type VariationDraft,
} from "./flag-helpers";
import { Field, TextInput } from "./FormFields";
import { RuleEditor } from "./RuleEditor";
import type { FlagshipFlag, FlagshipUpdateFlagData } from "../../api";
import type { JSX } from "react";

const TYPE_TABS: Array<{ className: string; label: string; value: FlagType }> =
	[
		{ className: "flex-1 justify-center", label: "Boolean", value: "boolean" },
		{ className: "flex-1 justify-center", label: "Number", value: "number" },
		{ className: "flex-1 justify-center", label: "String", value: "string" },
		{ className: "flex-1 justify-center", label: "JSON", value: "json" },
	];

interface FlagDialogProps {
	appId: string;
	flag: FlagshipFlag | null;
	flags: FlagshipFlag[];
	onOpenChange: (open: boolean) => void;
	onSaved: () => Promise<void>;
	open: boolean;
	worker?: string;
}

interface FormState {
	defaultServe: DefaultServeDraft;
	defaultVariationId: string;
	description: string;
	enabled: boolean;
	key: string;
	rules: RuleDraft[];
	type: FlagType;
	variations: VariationDraft[];
}

type ErrorField = "form" | "key" | "rules" | "split" | "variations";

interface FormError {
	field: ErrorField;
	message: string;
	variationId?: string;
	variationField?: "name" | "value";
}

function serveDefaultVariation(
	variations: VariationDraft[],
	defaultVariationId: string
): DefaultServeDraft {
	return {
		mode: "variation",
		splits: variations.map((variation) => ({
			variationId: variation.id,
			weight: variation.id === defaultVariationId ? "100" : "0",
		})),
		targetingKey: "",
	};
}

function emptyForm(): FormState {
	const variations = defaultVariationsForType("boolean");
	const defaultVariationId = variations[1].id;
	return {
		defaultServe: serveDefaultVariation(variations, defaultVariationId),
		defaultVariationId,
		description: "",
		enabled: true,
		key: "",
		rules: [],
		type: "boolean",
		variations,
	};
}

type UpdateBody = NonNullable<FlagshipUpdateFlagData["body"]>;

interface SavedValues {
	default_variation: string;
	description: string | null;
	enabled: boolean;
	rules: UpdateBody["rules"];
	variations: Record<string, unknown>;
}

function changedFields(flag: FlagshipFlag, next: SavedValues): UpdateBody {
	const body: UpdateBody = {};
	if (next.default_variation !== flag.default_variation) {
		body.default_variation = next.default_variation;
	}
	if (next.description !== (flag.description ?? null)) {
		body.description = next.description;
	}
	if (next.enabled !== flag.enabled) {
		body.enabled = next.enabled;
	}
	if (JSON.stringify(next.variations) !== JSON.stringify(flag.variations)) {
		body.variations = next.variations;
	}
	if (canonicalRules(next.rules) !== canonicalRules(flag.rules)) {
		body.rules = next.rules;
	}
	return body;
}

function formFromFlag(flag: FlagshipFlag): FormState {
	const type = flag.type ?? inferFlagType(flag.variations);
	const variations = variationDraftsFrom(type, flag.variations);
	const current = variations.find((row) => row.name === flag.default_variation);
	const defaultVariationId = current?.id ?? variations[0].id;
	const variationIdByName = new Map(
		variations.map((variation) => [variation.name, variation.id])
	);
	const { defaultServe, targetingRules } = inferDefaultServe(
		flag.rules,
		defaultVariationId,
		variations,
		variationIdByName
	);
	return {
		defaultServe,
		defaultVariationId,
		description: flag.description ?? "",
		enabled: flag.enabled,
		key: flag.key,
		rules: ruleDraftsFrom(targetingRules, variationIdByName),
		type,
		variations,
	};
}

export function FlagDialog({
	appId,
	flag,
	flags,
	onOpenChange,
	onSaved,
	open,
	worker,
}: FlagDialogProps): JSX.Element {
	const [form, setForm] = useState<FormState>(emptyForm);
	const [error, setError] = useState<FormError | null>(null);
	const [saving, setSaving] = useState(false);
	const errorRef = useRef<HTMLParagraphElement>(null);
	const wasOpen = useRef(false);

	const editing = flag !== null;

	useEffect(() => {
		if (open && !wasOpen.current) {
			setForm(flag === null ? emptyForm() : formFromFlag(flag));
			setError(null);
			setSaving(false);
		}
		wasOpen.current = open;
	}, [flag, open]);

	useEffect(() => {
		if (error !== null) {
			errorRef.current?.scrollIntoView({ block: "nearest" });
		}
	}, [error]);

	const existing = useMemo(
		() =>
			new Set(
				flags.flatMap((entry) =>
					entry.key === undefined || entry.key === flag?.key ? [] : [entry.key]
				)
			),
		[flag?.key, flags]
	);
	const isBoolean = form.type === "boolean";
	const showVariantDelete = !isBoolean || form.variations.length !== 2;
	const variantGridColumns = showVariantDelete
		? "grid-cols-[3rem_minmax(0,1fr)_minmax(0,1.5fr)_2.25rem]"
		: "grid-cols-[3rem_minmax(0,1fr)_minmax(0,1.5fr)]";

	function handleTypeChange(value: string): void {
		const selected = TYPE_TABS.find((tab) => tab.value === value);
		if (selected === undefined || selected.value === form.type) {
			return;
		}
		if (form.rules.length > 0) {
			setError({
				field: "rules",
				message: "Remove targeting rules before changing the flag type.",
			});
			return;
		}
		const variations = defaultVariationsForType(selected.value);
		const defaultVariationId =
			selected.value === "boolean" ? variations[1].id : variations[0].id;
		setError((current) => (current?.field === "variations" ? null : current));
		setForm((current) => ({
			...current,
			defaultServe: serveDefaultVariation(variations, defaultVariationId),
			defaultVariationId,
			rules: [],
			type: selected.value,
			variations,
		}));
	}

	function updateVariation(
		id: string,
		patch: Partial<Pick<VariationDraft, "name" | "value">>
	): void {
		setError((current) => (current?.variationId === id ? null : current));
		setForm((current) => {
			return {
				...current,
				variations: current.variations.map((row) =>
					row.id === id ? { ...row, ...patch } : row
				),
			};
		});
	}

	function addVariation(): void {
		setForm((current) => ({
			...current,
			variations: [
				...current.variations,
				{ id: crypto.randomUUID(), name: "", value: "" },
			],
		}));
	}

	function removeVariation(id: string): void {
		if (form.rules.some((rule) => rule.serveVariationId === id)) {
			setError({
				field: "variations",
				message:
					"This variant is served by a targeting rule. Choose another variant in that rule before removing it.",
				variationId: id,
			});
			return;
		}
		setForm((current) => {
			const variations = current.variations.filter((row) => row.id !== id);
			const defaultVariationId =
				current.defaultVariationId === id
					? (variations[0]?.id ?? current.defaultVariationId)
					: current.defaultVariationId;
			const removedWeight = Number(
				current.defaultServe.splits.find((split) => split.variationId === id)
					?.weight ?? 0
			);
			return {
				...current,
				// Hand the removed share to the default so the split still totals 100.
				defaultServe: {
					...current.defaultServe,
					splits: alignSplits(current.defaultServe.splits, variations).map(
						(split) =>
							split.variationId === defaultVariationId &&
							Number.isFinite(removedWeight)
								? {
										...split,
										weight: String((Number(split.weight) || 0) + removedWeight),
									}
								: split
					),
				},
				defaultVariationId,
				variations,
			};
		});
	}

	function failVariations(
		message: string,
		variationId?: string,
		variationField?: "name" | "value"
	): void {
		setError({ field: "variations", message, variationField, variationId });
	}

	async function handleSave(): Promise<void> {
		setError(null);

		if (!editing) {
			const keyError = validateFlagKey(form.key, existing);
			if (keyError !== null) {
				setError({ field: "key", message: keyError });
				return;
			}
		}

		const names = new Set<string>();
		const variations: Record<string, unknown> = {};
		for (const row of form.variations) {
			const name = row.name.trim();
			if (name === "") {
				failVariations("Each variant needs a label.", row.id, "name");
				return;
			}
			if (names.has(name)) {
				failVariations(
					`Variant label '${name}' is used more than once.`,
					row.id,
					"name"
				);
				return;
			}
			names.add(name);
			const parsed = parseVariationValue(form.type, row.value);
			if (!parsed.ok) {
				failVariations(parsed.error, row.id, "value");
				return;
			}
			variations[name] = parsed.value;
		}

		const defaultRow = form.variations.find(
			(row) => row.id === form.defaultVariationId
		);
		if (defaultRow === undefined) {
			failVariations("Choose a default variant.");
			return;
		}

		const variationNameById = new Map(
			form.variations.map((variation) => [variation.id, variation.name.trim()])
		);
		const defaultServe: DefaultServeDraft = {
			...form.defaultServe,
			splits: alignSplits(form.defaultServe.splits, form.variations),
		};
		const usesSplit =
			defaultServe.mode === "percentage" && form.variations.length > 1;
		const ruleError = validateRuleDrafts(
			form.rules,
			new Set(variationNameById.keys()),
			usesSplit
		);
		if (ruleError !== null) {
			setError({
				field: "rules",
				message: ruleError,
			});
			return;
		}
		const splitError = usesSplit ? validateDefaultServe(defaultServe) : null;
		if (splitError !== null) {
			setError({ field: "split", message: splitError });
			return;
		}
		const targetingRules = ruleDraftsToRules(form.rules, variationNameById);
		const rules = [
			...targetingRules,
			...defaultServeToRules(
				usesSplit ? defaultServe : { ...defaultServe, mode: "variation" },
				// Split rules must sort after every targeting rule, because the
				// first matching rule wins.
				Math.max(0, ...targetingRules.map((rule) => rule.priority)) + 1,
				form.defaultVariationId,
				variationNameById
			),
		];

		const defaultVariation = defaultRow.name.trim();
		const description = form.description.trim() || null;

		setSaving(true);
		try {
			if (editing) {
				await flagshipUpdateFlag({
					body: changedFields(flag, {
						default_variation: defaultVariation,
						description,
						enabled: form.enabled,
						rules,
						variations,
					}),
					path: { app_id: appId, flag_key: flag.key },
					query: { worker },
				});
			} else {
				await flagshipCreateFlag({
					body: {
						default_variation: defaultVariation,
						description: description ?? undefined,
						enabled: form.enabled,
						key: form.key.trim(),
						rules,
						variations,
					},
					path: { app_id: appId },
					query: { worker },
				});
			}
		} catch (caught) {
			setError({
				field: "form",
				message: flagshipErrorMessage(
					caught,
					editing ? "Failed to update flag" : "Failed to create flag"
				),
			});
			setSaving(false);
			return;
		}
		setSaving(false);
		onOpenChange(false);
		await onSaved();
	}

	return (
		<Dialog.Root onOpenChange={onOpenChange} open={open}>
			<Dialog
				className="flex max-h-[calc(100vh-4rem)] min-w-0! flex-col overflow-hidden p-0"
				size="xl"
				style={{ width: "min(56rem, calc(100vw - 2rem))" }}
			>
				<div className="flex items-start justify-between gap-4 px-6 py-5">
					<div className="min-w-0">
						{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
						<Dialog.Title className="text-lg font-semibold text-kumo-default">
							{editing ? "Edit flag" : "Create flag"}
						</Dialog.Title>
						<p className="mt-1 text-sm text-kumo-subtle">
							{editing
								? "Saves to the local store. The Worker running in dev picks the change up on its next read."
								: "Adds a flag to the local store. The Worker running in dev can read it immediately."}
						</p>
					</div>
					<Switch
						checked={form.enabled}
						className="shrink-0"
						disabled={saving}
						label={form.enabled ? "Enabled" : "Disabled"}
						onCheckedChange={(enabled) =>
							setForm((current) => ({ ...current, enabled }))
						}
					/>
				</div>

				<div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto border-y border-kumo-fill px-6 py-5">
					{error?.field === "form" ? (
						<Banner description={error.message} variant="error" />
					) : null}

					<Field
						description={
							editing ? "A flag's key cannot be changed." : undefined
						}
						error={error?.field === "key" ? error.message : undefined}
						htmlFor={editing ? undefined : "flag-key"}
						label="Key"
					>
						{editing ? (
							<p className="flex h-9 items-center rounded-lg bg-kumo-elevated px-3 font-mono text-sm text-kumo-subtle ring-1 ring-kumo-fill">
								{form.key}
							</p>
						) : (
							<TextInput
								disabled={saving}
								id="flag-key"
								invalid={error?.field === "key"}
								maxLength={64}
								mono
								onEnter={() => void handleSave()}
								onValueChange={(value) => {
									setError((current) =>
										current?.field === "key" ? null : current
									);
									setForm((current) => ({
										...current,
										key: value.replaceAll(" ", "-"),
									}));
								}}
								placeholder="new-checkout"
								value={form.key}
							/>
						)}
					</Field>

					<Field
						description="Helps you remember what this flag controls."
						htmlFor="flag-description"
						label="Description"
						optional
					>
						<TextInput
							disabled={saving}
							id="flag-description"
							onEnter={() => void handleSave()}
							onValueChange={(value) =>
								setForm((current) => ({ ...current, description: value }))
							}
							placeholder="Serves the rebuilt checkout flow"
							value={form.description}
						/>
					</Field>

					{editing ? null : (
						<div className="flex flex-col gap-2">
							<Label>Type</Label>
							<Tabs
								className="w-full"
								onValueChange={handleTypeChange}
								tabs={TYPE_TABS}
								value={form.type}
								variant="segmented"
							/>
						</div>
					)}

					<div className="flex flex-col gap-2">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<Label>Variants</Label>
								{editing ? (
									<Badge variant="secondary">
										{FLAG_TYPE_LABELS[form.type]}
									</Badge>
								) : null}
							</div>
							{isBoolean ? (
								<Tooltip content="Boolean flags are limited to true and false.">
									<span>
										<Button
											disabled
											icon={<PlusIcon size={14} />}
											size="sm"
											variant="ghost"
										>
											Add variant
										</Button>
									</span>
								</Tooltip>
							) : (
								<Button
									disabled={saving}
									icon={<PlusIcon size={14} />}
									onClick={addVariation}
									size="sm"
									variant="ghost"
								>
									Add variant
								</Button>
							)}
						</div>
						<p className="text-xs text-kumo-subtle">
							{isBoolean
								? "Boolean flags always serve true or false."
								: "Pick which variant is served when no targeting rule matches."}
						</p>

						<div className="overflow-hidden rounded-lg border border-kumo-fill">
							<div
								className={`grid ${variantGridColumns} items-center gap-3 border-b border-kumo-fill bg-kumo-elevated px-3 py-2 text-xs font-medium text-kumo-subtle`}
							>
								<span className="text-center">Default</span>
								<span>Label</span>
								<span>Value</span>
								{showVariantDelete ? <span /> : null}
							</div>
							{form.variations.map((row) => (
								<div
									className={`grid ${variantGridColumns} items-center gap-3 border-b border-kumo-fill px-3 py-2 last:border-b-0`}
									key={row.id}
								>
									<input
										aria-label={`Use ${row.name || "variant"} by default`}
										checked={form.defaultVariationId === row.id}
										className="size-4 justify-self-center accent-kumo-brand"
										disabled={saving}
										name="default-variation"
										onChange={() =>
											setForm((current) => ({
												...current,
												defaultVariationId: row.id,
											}))
										}
										type="radio"
									/>
									<TextInput
										ariaLabel={`Label for ${row.name || "variant"}`}
										disabled={saving}
										invalid={
											error?.variationId === row.id &&
											error.variationField === "name"
										}
										mono
										onEnter={() => void handleSave()}
										onValueChange={(value) =>
											updateVariation(row.id, {
												name: sanitizeVariationName(value),
											})
										}
										placeholder="label"
										value={row.name}
									/>
									{isBoolean ? (
										<span className="flex h-9 items-center rounded-lg bg-kumo-elevated px-3 font-mono text-sm text-kumo-subtle ring-1 ring-kumo-fill">
											{row.value}
										</span>
									) : (
										<TextInput
											ariaLabel={`Value for ${row.name || "variant"}`}
											disabled={saving}
											invalid={
												error?.variationId === row.id &&
												error.variationField === "value"
											}
											mono
											numeric={form.type === "number"}
											onEnter={() => void handleSave()}
											onValueChange={(value) =>
												updateVariation(row.id, { value })
											}
											placeholder="value"
											value={row.value}
										/>
									)}
									{showVariantDelete ? (
										<Button
											aria-label={`Remove ${row.name || "variant"}`}
											className="justify-self-center text-kumo-subtle hover:text-kumo-danger"
											disabled={saving || form.variations.length <= 1}
											icon={<TrashIcon size={14} />}
											onClick={() => removeVariation(row.id)}
											shape="square"
											variant="ghost"
										/>
									) : null}
								</div>
							))}
						</div>

						{error?.field === "variations" ? (
							<p
								className="text-xs text-kumo-danger"
								ref={errorRef}
								role="alert"
							>
								{error.message}
							</p>
						) : null}
					</div>

					<div
						ref={
							error?.field === "rules" || error?.field === "split"
								? errorRef
								: undefined
						}
					>
						<RuleEditor
							defaultServe={form.defaultServe}
							defaultVariationId={form.defaultVariationId}
							disabled={saving}
							error={error?.field === "rules" ? error.message : undefined}
							onChange={(rules) => {
								setError((current) =>
									current?.field === "rules" ? null : current
								);
								setForm((current) => ({ ...current, rules }));
							}}
							onDefaultServeChange={(defaultServe) => {
								setError((current) =>
									current?.field === "split" ? null : current
								);
								setForm((current) => ({ ...current, defaultServe }));
							}}
							rules={form.rules}
							splitError={error?.field === "split" ? error.message : undefined}
							variations={form.variations}
						/>
					</div>
				</div>

				<div className="flex justify-end gap-2 px-6 py-5">
					<Button
						disabled={saving}
						onClick={() => onOpenChange(false)}
						variant="secondary"
					>
						Cancel
					</Button>
					<Button
						disabled={saving || (!editing && form.key.trim() === "")}
						loading={saving}
						onClick={() => void handleSave()}
						variant="primary"
					>
						{editing ? "Save changes" : "Create flag"}
					</Button>
				</div>
			</Dialog>
		</Dialog.Root>
	);
}
