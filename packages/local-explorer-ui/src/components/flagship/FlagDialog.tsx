import { Banner, Button, Dialog, Label, Switch, Tabs } from "@cloudflare/kumo";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { flagshipCreateFlag, flagshipUpdateFlag } from "../../api";
import {
	defaultVariationsForType,
	flagshipErrorMessage,
	inferFlagType,
	parseVariationValue,
	validateFlagKey,
	variationDraftsFrom,
	type FlagType,
	type VariationDraft,
} from "./flag-helpers";
import { Field, TextInput } from "./FormFields";
import {
	rulesFrom,
	uiRulesFrom,
	validateRules,
	type RuleError,
	type UIRule,
} from "./rule-helpers";
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

const TYPE_LABELS: Record<FlagType, string> = {
	boolean: "Boolean",
	json: "JSON",
	number: "Number",
	string: "String",
};

interface FlagDialogProps {
	appId: string;
	/** Flag to edit, or null to create a new one. */
	flag: FlagshipFlag | null;
	/** Every flag in the app, used to reject duplicate keys. */
	flags: FlagshipFlag[];
	onOpenChange: (open: boolean) => void;
	onSaved: () => Promise<void>;
	open: boolean;
}

interface FormState {
	defaultVariationId: string;
	description: string;
	enabled: boolean;
	key: string;
	/**
	 * Targeting rules, or null when the stored rules use nesting the editor
	 * cannot represent. In that case they are left untouched on save.
	 */
	rules: UIRule[] | null;
	type: FlagType;
	variations: VariationDraft[];
}

/**
 * Which part of the form a validation message belongs to, so it can be shown
 * next to the control that caused it rather than in a banner far above it.
 */
type ErrorField = "form" | "key" | "rules" | "variations";

interface FormError {
	field: ErrorField;
	message: string;
	/** Variant row the message belongs to, so the offending input can be flagged. */
	variationId?: string;
	/** Which cell of that row is at fault. */
	variationField?: "name" | "value";
}

/**
 * Builds the initial form state for a new boolean flag.
 */
function emptyForm(): FormState {
	const variations = defaultVariationsForType("boolean");
	return {
		defaultVariationId: variations[1].id,
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
	rules: UpdateBody["rules"] | null;
	variations: Record<string, unknown>;
}

/**
 * Narrows an update to the fields that actually changed.
 *
 * Sending only what was edited means a concurrent change to another field, made
 * from the CLI or a second window, survives this save instead of being reverted
 * to the state the dialog was opened with. Rules are omitted entirely when they
 * could not be represented in the editor.
 *
 * @returns The request body for a partial update
 */
function changedFields(flag: FlagshipFlag, next: SavedValues): UpdateBody {
	const body: UpdateBody = {};
	const currentUiRules = uiRulesFrom(flag.rules);
	const currentRules =
		currentUiRules === null ? null : rulesFrom(currentUiRules);
	if (next.default_variation !== flag.default_variation) {
		body.default_variation = next.default_variation;
	}
	if (next.description !== (flag.description ?? null)) {
		body.description = next.description;
	}
	if (next.enabled !== flag.enabled) {
		body.enabled = next.enabled;
	}
	if (
		JSON.stringify(next.variations) !== JSON.stringify(flag.variations ?? {})
	) {
		body.variations = next.variations;
	}
	if (
		next.rules !== null &&
		JSON.stringify(next.rules) !== JSON.stringify(currentRules)
	) {
		body.rules = next.rules;
	}
	return body;
}

/**
 * Builds form state from an existing flag.
 */
function formFromFlag(flag: FlagshipFlag): FormState {
	const type = flag.type ?? inferFlagType(flag.variations);
	const variations = variationDraftsFrom(type, flag.variations);
	const current = variations.find((row) => row.name === flag.default_variation);
	return {
		defaultVariationId: current?.id ?? variations[0].id,
		description: flag.description ?? "",
		enabled: flag.enabled === true,
		key: flag.key ?? "",
		rules: uiRulesFrom(flag.rules),
		type,
		variations,
	};
}

/**
 * Renders the dialog used to add a flag to the local Flagship store, or to edit
 * one that is already there.
 */
export function FlagDialog({
	appId,
	flag,
	flags,
	onOpenChange,
	onSaved,
	open,
}: FlagDialogProps): JSX.Element {
	const [form, setForm] = useState<FormState>(emptyForm);
	const [error, setError] = useState<FormError | null>(null);
	const [ruleErrors, setRuleErrors] = useState<RuleError[]>([]);
	const [saving, setSaving] = useState(false);
	const errorRef = useRef<HTMLParagraphElement>(null);
	const wasOpen = useRef(false);

	const editing = flag !== null;

	// Seed only on open, so a background refresh cannot overwrite what is typed.
	useEffect(() => {
		if (open && !wasOpen.current) {
			setForm(flag === null ? emptyForm() : formFromFlag(flag));
			setError(null);
			setRuleErrors([]);
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

	/**
	 * Forwards the new open state, resetting the form once it closes.
	 */
	function handleOpenChange(next: boolean): void {
		if (!next) {
			setError(null);
			setRuleErrors([]);
			setSaving(false);
		}
		onOpenChange(next);
	}

	/**
	 * Switches the flag type and seeds matching example variants.
	 */
	function handleTypeChange(value: string): void {
		const selected = TYPE_TABS.find((tab) => tab.value === value);
		if (selected === undefined) {
			return;
		}
		const variations = defaultVariationsForType(selected.value);
		setError((current) => (current?.field === "variations" ? null : current));
		setRuleErrors([]);
		setForm((current) => ({
			...current,
			defaultVariationId:
				selected.value === "boolean" ? variations[1].id : variations[0].id,
			// New variants replace the old ones, so existing rules would dangle.
			rules: current.rules === null ? null : [],
			type: selected.value,
			variations,
		}));
	}

	/**
	 * Updates a single variant row.
	 */
	function updateVariation(
		id: string,
		patch: Partial<Pick<VariationDraft, "name" | "value">>
	): void {
		setError((current) => (current?.variationId === id ? null : current));
		setForm((current) => {
			const previous = current.variations.find((row) => row.id === id);
			const renamedFrom = patch.name === undefined ? undefined : previous?.name;
			const renamedTo = patch.name;
			return {
				...current,
				rules:
					current.rules === null ||
					renamedFrom === undefined ||
					renamedTo === undefined
						? current.rules
						: current.rules.map((rule) =>
								rule.serveVariation === renamedFrom
									? { ...rule, serveVariation: renamedTo }
									: rule
							),
				variations: current.variations.map((row) =>
					row.id === id ? { ...row, ...patch } : row
				),
			};
		});
	}

	/**
	 * Appends an empty variant row.
	 */
	function addVariation(): void {
		setForm((current) => ({
			...current,
			variations: [
				...current.variations,
				{ id: crypto.randomUUID(), name: "", value: "" },
			],
		}));
	}

	/**
	 * Removes a variant row, reassigning the default when needed.
	 */
	function removeVariation(id: string): void {
		setForm((current) => {
			const variations = current.variations.filter((row) => row.id !== id);
			return {
				...current,
				defaultVariationId:
					current.defaultVariationId === id
						? (variations[0]?.id ?? current.defaultVariationId)
						: current.defaultVariationId,
				variations,
			};
		});
	}

	/**
	 * Reports a problem with one of the variants.
	 */
	function failVariations(
		message: string,
		variationId?: string,
		variationField?: "name" | "value"
	): void {
		setError({ field: "variations", message, variationField, variationId });
	}

	/**
	 * Validates the form and writes the flag to the local store.
	 */
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

		if (form.rules !== null) {
			const found = validateRules(form.rules, [...names]);
			if (found.length > 0) {
				setRuleErrors(found);
				setError({ field: "rules", message: "Fix the targeting rules below." });
				return;
			}
			setRuleErrors([]);
		}

		if (editing && flag.key === undefined) {
			setError({ field: "form", message: "This flag has no key to update." });
			return;
		}

		const defaultVariation = defaultRow.name.trim();
		const description = form.description.trim() || null;
		const rules = form.rules === null ? null : rulesFrom(form.rules);

		setSaving(true);
		try {
			if (editing && flag.key !== undefined) {
				await flagshipUpdateFlag({
					body: changedFields(flag, {
						default_variation: defaultVariation,
						description,
						enabled: form.enabled,
						rules,
						variations,
					}),
					path: { app_id: appId, flag_key: flag.key },
				});
			} else {
				await flagshipCreateFlag({
					body: {
						default_variation: defaultVariation,
						description: description ?? undefined,
						enabled: form.enabled,
						key: form.key.trim(),
						...(rules === null ? {} : { rules }),
						variations,
					},
					path: { app_id: appId },
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
		<Dialog.Root onOpenChange={handleOpenChange} open={open}>
			<Dialog
				className="flex max-h-[calc(100vh-4rem)] flex-col overflow-hidden p-0"
				size="xl"
				style={{ width: "min(40rem, calc(100vw - 2rem))" }}
			>
				<div className="px-6 py-5">
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

					<div className="flex flex-col gap-2">
						<Label>Type</Label>
						{editing ? (
							<>
								<p className="flex h-9 items-center rounded-lg bg-kumo-elevated px-3 text-sm text-kumo-subtle ring-1 ring-kumo-fill">
									{TYPE_LABELS[form.type]}
								</p>
								<p className="text-xs text-kumo-subtle">
									Changing a flag's type would invalidate every variant, so
									delete and recreate the flag instead.
								</p>
							</>
						) : (
							<Tabs
								className="w-full"
								onValueChange={handleTypeChange}
								tabs={TYPE_TABS}
								value={form.type}
								variant="segmented"
							/>
						)}
					</div>

					<div className="flex flex-col gap-2">
						<div>
							<Label>Variants</Label>
							<p className="mt-1 text-xs text-kumo-subtle">
								{isBoolean
									? "Boolean flags always serve true or false."
									: "Pick which variant is served when no targeting rule matches."}
							</p>
						</div>

						<div className="overflow-hidden rounded-lg border border-kumo-fill">
							<div className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1.5fr)_2.25rem] items-center gap-3 border-b border-kumo-fill bg-kumo-elevated px-3 py-2 text-xs font-medium text-kumo-subtle">
								<span className="text-center">Default</span>
								<span>Label</span>
								<span>Value</span>
								<span />
							</div>
							{form.variations.map((row) => (
								<div
									className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1.5fr)_2.25rem] items-center gap-3 border-b border-kumo-fill px-3 py-2 last:border-b-0"
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
												name: value.replaceAll(" ", "-"),
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
									{form.variations.length < 3 ? (
										<span />
									) : (
										<Button
											aria-label={`Remove ${row.name || "variant"}`}
											className="justify-self-center text-kumo-subtle hover:text-kumo-danger"
											disabled={saving}
											icon={<TrashIcon size={14} />}
											onClick={() => removeVariation(row.id)}
											shape="square"
											variant="ghost"
										/>
									)}
								</div>
							))}
						</div>

						{isBoolean ? null : (
							<Button
								disabled={saving}
								icon={<PlusIcon size={14} />}
								onClick={addVariation}
								size="sm"
								variant="secondary"
							>
								Add variant
							</Button>
						)}

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

					<div className="flex flex-col gap-2">
						<div>
							<Label>Targeting rules</Label>
							<p className="mt-1 text-xs text-kumo-subtle">
								Checked from top to bottom. The first rule that matches decides
								what is served, and anything unmatched falls through to the
								default variant.
							</p>
						</div>

						{form.rules === null ? (
							<div className="rounded-lg border border-kumo-fill px-3 py-2.5">
								<p className="text-xs text-kumo-subtle">
									This flag&apos;s rules use nested conditions that this editor
									cannot show. They are left untouched when you save. Edit them
									with{" "}
									<code className="font-mono text-kumo-default">
										wrangler flagship flags rules
									</code>{" "}
									instead.
								</p>
							</div>
						) : (
							<RuleEditor
								disabled={saving}
								errors={ruleErrors}
								onChange={(rules) => {
									setRuleErrors([]);
									setError((current) =>
										current?.field === "rules" ? null : current
									);
									setForm((current) => ({ ...current, rules }));
								}}
								rules={form.rules}
								variationNames={form.variations.flatMap((row) =>
									row.name.trim() === "" ? [] : [row.name.trim()]
								)}
							/>
						)}

						{error?.field === "rules" ? (
							<p
								className="text-xs text-kumo-danger"
								ref={errorRef}
								role="alert"
							>
								{error.message}
							</p>
						) : null}
					</div>

					<div className="flex items-center justify-between gap-4 rounded-lg border border-kumo-fill px-3 py-2.5">
						<div>
							<p className="text-sm font-medium text-kumo-default">Enabled</p>
							<p className="mt-0.5 text-xs text-kumo-subtle">
								When off, every request receives the default variant.
							</p>
						</div>
						<Switch
							aria-label="Enabled"
							checked={form.enabled}
							disabled={saving}
							onCheckedChange={(enabled) =>
								setForm((current) => ({ ...current, enabled }))
							}
							size="sm"
						/>
					</div>
				</div>

				<div className="flex justify-end gap-2 px-6 py-5">
					<Button
						disabled={saving}
						onClick={() => handleOpenChange(false)}
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
