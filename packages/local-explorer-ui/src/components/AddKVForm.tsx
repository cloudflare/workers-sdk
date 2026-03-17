import { Button, cn, Dialog } from "@cloudflare/kumo";
import { PlusIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { validateKey } from "../utils/kv-validation";

interface AddKVDialogProps {
	onAdd: (key: string, value: string) => Promise<boolean>;
	clearSignal?: number;
	disabled?: boolean;
}

export function AddKVDialog({
	onAdd,
	clearSignal = 0,
	disabled = false,
}: AddKVDialogProps) {
	const [open, setOpen] = useState<boolean>(false);
	const [key, setKey] = useState<string>("");
	const [value, setValue] = useState<string>("");
	const [saving, setSaving] = useState<boolean>(false);
	const [keyError, setKeyError] = useState<string | null>(null);

	useEffect(() => {
		if (clearSignal > 0) {
			setKey("");
			setValue("");
			setKeyError(null);
		}
	}, [clearSignal]);

	function handleKeyChange(e: React.ChangeEvent<HTMLInputElement>): void {
		const newValue = e.target.value;
		setKey(newValue);
		setKeyError(newValue.trim() ? validateKey(newValue) : null);
	}

	async function handleSubmit(e: React.FormEvent): Promise<void> {
		e.preventDefault();

		const validationError = validateKey(key);
		if (validationError) {
			setKeyError(validationError);
			return;
		}

		try {
			setSaving(true);
			const completed = await onAdd(key, value);
			if (completed) {
				setKey("");
				setValue("");
				setKeyError(null);
				setOpen(false);
			}
		} finally {
			setSaving(false);
		}
	}

	function handleOpenChange(isOpen: boolean): void {
		setOpen(isOpen);
		if (isOpen) {
			return;
		}

		// Reset form when closing
		setKey("");
		setValue("");
		setKeyError(null);
	}

	const isKeyInvalid = !!validateKey(key);

	return (
		<Dialog.Root open={open} onOpenChange={handleOpenChange}>
			<Dialog.Trigger
				render={
					<Button disabled={disabled} icon={PlusIcon} variant="primary">
						Add Entry
					</Button>
				}
			/>
			<Dialog className="w-full max-w-lg p-6">
				{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
				<Dialog.Title className="mb-4 text-lg font-semibold">
					Add Entry
				</Dialog.Title>
				<form onSubmit={handleSubmit}>
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-1.5">
							<label
								className="text-sm font-medium text-text"
								htmlFor="add-key"
							>
								Key
							</label>
							<input
								id="add-key"
								className={cn(
									"h-9 w-full rounded-md border border-border bg-bg px-3 font-mono text-sm text-text placeholder:text-muted focus:border-primary focus:shadow-focus-primary focus:outline-none disabled:bg-bg-secondary disabled:text-text-secondary",
									{
										"border-danger focus:shadow-focus-danger": keyError,
									}
								)}
								placeholder="Enter key name"
								value={key}
								onChange={handleKeyChange}
								disabled={saving}
								autoFocus
							/>
							{keyError && (
								<span className="text-xs text-danger">{keyError}</span>
							)}
						</div>
						<div className="flex flex-col gap-1.5">
							<label
								className="text-sm font-medium text-text"
								htmlFor="add-value"
							>
								Value
							</label>
							<textarea
								id="add-value"
								className="max-h-48 min-h-24 w-full resize-none overflow-y-auto rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-text placeholder:text-muted focus:border-primary focus:shadow-focus-primary focus:outline-none disabled:bg-bg-secondary disabled:text-text-secondary"
								placeholder="Enter value"
								value={value}
								onChange={(e) => setValue(e.target.value)}
								disabled={saving}
							/>
						</div>
					</div>
					<div className="mt-6 flex justify-end gap-2">
						<Button
							type="button"
							variant="secondary"
							onClick={() => handleOpenChange(false)}
							disabled={saving}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							variant="primary"
							disabled={saving || isKeyInvalid || !key.trim()}
							loading={saving}
						>
							{saving ? "Adding..." : "Add Entry"}
						</Button>
					</div>
				</form>
			</Dialog>
		</Dialog.Root>
	);
}
