import { Button, Dialog } from "@cloudflare/kumo";
import { TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import type { JSX } from "react";

/**
 * A destructive "Clear" button that asks for confirmation before running.
 * Clearing wipes all captured telemetry (traces and events) and can't be
 * undone, so it's gated behind a confirmation dialog.
 */
export function ClearButton({
	onConfirm,
	loading = false,
	disabled = false,
}: {
	/** Runs when the user confirms; should perform the actual clear. */
	onConfirm: () => void | Promise<void>;
	loading?: boolean;
	disabled?: boolean;
}): JSX.Element {
	const [open, setOpen] = useState(false);

	const confirm = () => {
		setOpen(false);
		void onConfirm();
	};

	return (
		<>
			<Button
				size="sm"
				variant="ghost"
				icon={TrashIcon}
				title="Clear all captured traces and events"
				loading={loading}
				disabled={disabled || loading}
				onClick={() => setOpen(true)}
			>
				Clear
			</Button>

			<Dialog.Root open={open} onOpenChange={setOpen}>
				<Dialog size="sm">
					<div className="px-6 pt-6 pb-4">
						{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
						<Dialog.Title className="text-lg font-semibold text-kumo-default">
							Clear all telemetry?
						</Dialog.Title>
						<p className="mt-1 text-sm text-kumo-subtle">
							This permanently deletes all captured traces and events. This
							can't be undone.
						</p>
					</div>
					<div className="flex justify-end gap-2 border-t border-kumo-fill px-6 py-4">
						<Button variant="secondary" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button variant="destructive" onClick={confirm}>
							Clear everything
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</>
	);
}
