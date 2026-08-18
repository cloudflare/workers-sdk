import {
	Button,
	Dialog,
	Label,
	Switch,
	Table,
	Textarea,
	cn,
} from "@cloudflare/kumo";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { flagshipCreateFlag } from "../api";
import {
	defaultVariationsForType,
	flagshipErrorMessage,
	parseVariationValue,
	validateFlagKey,
	type FlagType,
	type VariationDraft,
} from "./flagship/flag-helpers";
import type { JSX } from "react";

const TYPE_TABS: Array<{ label: string; value: FlagType }> = [
	{ label: "Boolean", value: "boolean" },
	{ label: "Number", value: "number" },
	{ label: "String", value: "string" },
	{ label: "JSON", value: "json" },
];

interface CreateFlagDialogProps {
	appId: string;
	existingKeys: string[];
	onCreated: () => Promise<void>;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}

interface FormState {
	defaultVariationId: string;
	description: string;
	enabled: boolean;
	key: string;
	type: FlagType;
	variations: VariationDraft[];
}

/**
 * Build a blank create-flag form, defaulting to an enabled boolean flag.
 *
 * @returns Fresh form state.
 */
function emptyForm(): FormState {
	const variations = defaultVariationsForType("boolean");
	return {
		defaultVariationId: variations[1]?.id ?? variations[0].id,
		description: "",
		enabled: true,
		key: "",
		type: "boolean",
		variations,
	};
}

/**
 * Two-step create-flag dialog modelled on the dash wizard.
 *
 * Targeting rules are deliberately absent: they belong to
 * `wrangler flagship flags rules`.
 *
 * @param props The app to create in, existing keys, and dialog state.
 * @returns The dialog element.
 */
export function CreateFlagDialog({
	appId,
	existingKeys,
	onCreated,
	onOpenChange,
	open,
}: CreateFlagDialogProps): JSX.Element {
	const [step, setStep] = useState<1 | 2>(1);
	const [form, setForm] = useState<FormState>(emptyForm);
	const [error, setError] = useState<string | null>(null);
	const [keyTouched, setKeyTouched] = useState(false);
	const [saving, setSaving] = useState(false);

	const existing = useMemo(
		() => new Set(existingKeys.map((key) => key.toLowerCase())),
		[existingKeys]
	);

	const keyError = keyTouched ? validateFlagKey(form.key, existing) : null;

	function reset(): void {
		setStep(1);
		setForm(emptyForm());
		setError(null);
		setKeyTouched(false);
		setSaving(false);
	}

	function handleOpenChange(next: boolean): void {
		if (!next) {
			reset();
		}
		onOpenChange(next);
	}

	function setType(type: FlagType): void {
		const variations = defaultVariationsForType(type);
		setForm((current) => ({
			...current,
			defaultVariationId:
				type === "boolean"
					? (variations[1]?.id ?? variations[0].id)
					: variations[0].id,
			type,
			variations,
		}));
	}

	function updateVariation(
		id: string,
		patch: Partial<Pick<VariationDraft, "name" | "value">>
	): void {
		setForm((current) => ({
			...current,
			variations: current.variations.map((row) =>
				row.id === id ? { ...row, ...patch } : row
			),
		}));
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

	function goToVariants(): void {
		setKeyTouched(true);
		const nextError = validateFlagKey(form.key, existing);
		if (nextError !== null) {
			setError(nextError);
			return;
		}
		setError(null);
		setStep(2);
	}

	async function handleCreate(): Promise<void> {
		setError(null);

		const names = new Set<string>();
		const variations: Record<string, unknown> = {};
		for (const row of form.variations) {
			const name = row.name.trim();
			if (name === "") {
				setError("Each variant needs a name.");
				return;
			}
			if (names.has(name)) {
				setError(`Variant name '${name}' is used more than once.`);
				return;
			}
			names.add(name);
			const parsed = parseVariationValue(form.type, row.value);
			if (!parsed.ok) {
				setError(parsed.error);
				return;
			}
			variations[name] = parsed.value;
		}

		const defaultRow = form.variations.find(
			(row) => row.id === form.defaultVariationId
		);
		if (defaultRow === undefined) {
			setError("Choose a default variant.");
			return;
		}

		setSaving(true);
		try {
			await flagshipCreateFlag({
				body: {
					default_variation: defaultRow.name.trim(),
					description: form.description.trim() || undefined,
					enabled: form.enabled,
					key: form.key.trim(),
					variations,
				},
				path: { app_id: appId },
			});
			await onCreated();
			reset();
			onOpenChange(false);
		} catch (caught) {
			setError(flagshipErrorMessage(caught, "Failed to create flag"));
		} finally {
			setSaving(false);
		}
	}

	const isBoolean = form.type === "boolean";
	const canDeleteVariant = !isBoolean || form.variations.length > 2;

	return (
		<Dialog.Root onOpenChange={handleOpenChange} open={open}>
			<Dialog className="overflow-hidden p-0" size="lg">
				<div className="border-b border-kumo-fill px-6 pt-6 pb-4">
					{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
					<Dialog.Title className="text-lg font-semibold text-kumo-default">
						Create a flag
					</Dialog.Title>
					<p className="mt-1 text-sm text-kumo-subtle">
						{step === 1
							? "Set up the flag key and description."
							: "Define the values your flag can return."}
					</p>
				</div>

				<div className="px-6 py-6">
					{error === null ? null : (
						<div className="mb-5 rounded-lg border border-kumo-danger/20 bg-kumo-danger/8 p-3 text-sm text-kumo-danger">
							{error}
						</div>
					)}

					{step === 1 ? (
						<div className="flex flex-col gap-5">
							<div>
								<Label htmlFor="flag-key">Flag key</Label>
								<input
									className={cn(
										"mt-2 h-9 w-full rounded-lg bg-kumo-base px-3 font-mono text-base text-kumo-default ring-1 ring-kumo-fill outline-none placeholder:text-kumo-subtle focus:ring-kumo-brand disabled:opacity-50",
										keyError !== null &&
											"ring-kumo-danger focus:ring-kumo-danger"
									)}
									disabled={saving}
									id="flag-key"
									maxLength={64}
									onBlur={() => setKeyTouched(true)}
									onChange={(event) =>
										setForm((current) => ({
											...current,
											key: event.target.value.replaceAll(" ", "-"),
										}))
									}
									placeholder="e.g. enable-dark-mode"
									value={form.key}
								/>
								<p
									className={cn(
										"mt-1.5 text-xs text-kumo-subtle",
										keyError !== null && "text-kumo-danger"
									)}
								>
									{keyError ??
										"Letters, numbers, hyphens, and underscores. Max 64 characters."}
								</p>
							</div>

							<Textarea
								className="resize-y"
								disabled={saving}
								id="flag-description"
								label="Description"
								onChange={(event) =>
									setForm((current) => ({
										...current,
										description: event.target.value,
									}))
								}
								placeholder="What does this flag control?"
								rows={2}
								value={form.description}
							/>

							<div className="rounded-lg border border-kumo-fill bg-kumo-elevated p-4">
								<Switch
									checked={form.enabled}
									disabled={saving}
									label="Enable flag"
									onCheckedChange={(enabled) =>
										setForm((current) => ({ ...current, enabled }))
									}
									size="sm"
								/>
								<p className="mt-1 text-xs text-kumo-subtle">
									{form.enabled
										? "(Flag is active and rules determine the returned variant)"
										: "(Flag is inactive and the default variant is always returned)"}
								</p>
							</div>
						</div>
					) : (
						<div className="flex flex-col gap-5">
							<div
								className="flex rounded-lg border border-kumo-fill bg-kumo-elevated p-0.5"
								role="tablist"
							>
								{TYPE_TABS.map((tab) => (
									<button
										className={cn(
											"flex-1 rounded-md px-3 py-1.5 text-sm font-medium",
											form.type === tab.value
												? "bg-kumo-base text-kumo-default shadow-sm"
												: "text-kumo-subtle hover:text-kumo-default"
										)}
										disabled={saving}
										key={tab.value}
										onClick={() => setType(tab.value)}
										role="tab"
										type="button"
									>
										{tab.label}
									</button>
								))}
							</div>

							<div className="overflow-x-auto rounded-lg border border-kumo-fill bg-kumo-base">
								<div className="flex items-center justify-between border-b border-kumo-fill px-3 py-2">
									<span className="text-sm font-medium text-kumo-default">
										Variants
									</span>
									<Button
										disabled={isBoolean || saving}
										icon={<PlusIcon size={14} />}
										onClick={addVariation}
										variant="ghost"
									>
										Add
									</Button>
								</div>
								<Table>
									<Table.Header>
										<Table.Row>
											<Table.Head>Value</Table.Head>
											<Table.Head>Label</Table.Head>
											<Table.Head>Default</Table.Head>
											{canDeleteVariant ? (
												<Table.Head className="w-10">
													<span className="sr-only">Remove</span>
												</Table.Head>
											) : null}
										</Table.Row>
									</Table.Header>
									<Table.Body>
										{form.variations.map((row) => (
											<Table.Row key={row.id}>
												<Table.Cell>
													{isBoolean ? (
														<code className="font-mono text-xs text-kumo-default">
															{row.value}
														</code>
													) : (
														<input
															aria-label={`Value for ${row.name || "variant"}`}
															className="h-7 w-full rounded-md bg-kumo-elevated px-2 font-mono text-xs text-kumo-default ring-1 ring-kumo-fill outline-none focus:ring-kumo-brand disabled:opacity-50"
															disabled={saving}
															onChange={(event) =>
																updateVariation(row.id, {
																	value: event.target.value,
																})
															}
															value={row.value}
														/>
													)}
												</Table.Cell>
												<Table.Cell>
													<input
														aria-label={`Label for ${row.name || "variant"}`}
														className="h-7 w-full rounded-md bg-kumo-elevated px-2 font-mono text-xs text-kumo-default ring-1 ring-kumo-fill outline-none focus:ring-kumo-brand disabled:opacity-50"
														disabled={saving}
														onChange={(event) =>
															updateVariation(row.id, {
																name: event.target.value.replaceAll(" ", "-"),
															})
														}
														value={row.name}
													/>
												</Table.Cell>
												<Table.Cell>
													<input
														checked={form.defaultVariationId === row.id}
														className="size-4 accent-kumo-brand"
														disabled={saving}
														id={
															form.defaultVariationId === row.id
																? "flag-default"
																: undefined
														}
														name="default-variation"
														onChange={() =>
															setForm((current) => ({
																...current,
																defaultVariationId: row.id,
															}))
														}
														type="radio"
													/>
												</Table.Cell>
												{canDeleteVariant ? (
													<Table.Cell>
														<Button
															aria-label={`Remove ${row.name || "variant"}`}
															disabled={saving || form.variations.length < 2}
															onClick={() => removeVariation(row.id)}
															shape="square"
															variant="ghost"
														>
															<TrashIcon size={14} />
														</Button>
													</Table.Cell>
												) : null}
											</Table.Row>
										))}
									</Table.Body>
								</Table>
							</div>
							<p className="text-xs text-kumo-subtle">
								Configure targeting and percentage rollouts with{" "}
								<code className="font-mono text-kumo-default">
									wrangler flagship flags rules
								</code>
								.
							</p>
						</div>
					)}
				</div>

				<div className="flex justify-end gap-2 border-t border-kumo-fill px-6 py-4">
					{step === 1 ? (
						<>
							<Button
								disabled={saving}
								onClick={() => handleOpenChange(false)}
								variant="secondary"
							>
								Cancel
							</Button>
							<Button
								disabled={saving || form.key.trim() === ""}
								onClick={goToVariants}
							>
								Continue
							</Button>
						</>
					) : (
						<>
							<Button
								disabled={saving}
								onClick={() => {
									setError(null);
									setStep(1);
								}}
								variant="secondary"
							>
								Back
							</Button>
							<Button
								disabled={saving}
								loading={saving}
								onClick={() => void handleCreate()}
							>
								{saving ? "Creating..." : "Create flag"}
							</Button>
						</>
					)}
				</div>
			</Dialog>
		</Dialog.Root>
	);
}
