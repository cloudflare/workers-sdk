import { Button, Dialog, Text } from "@cloudflare/kumo";
import { useState } from "react";
import type { IStudioDriver } from "../../../types/studio";
import type { SubmitEvent } from "react";

interface DropTableConfirmationModalProps {
	closeModal: () => void;
	driver: IStudioDriver;
	isOpen: boolean;
	onSuccess?: () => void;
	schemaName: string;
	tableName: string;
}

export function DropTableConfirmationModal({
	closeModal,
	driver,
	isOpen,
	onSuccess,
	schemaName,
	tableName,
}: DropTableConfirmationModalProps): JSX.Element {
	const [challengeInput, setChallengeInput] = useState<string>("");
	const [error, setError] = useState<string | null>(null);
	const [isDeleting, setIsDeleting] = useState<boolean>(false);

	const isValid = challengeInput === tableName;

	const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
		e.preventDefault();
		setIsDeleting(true);
		setError(null);

		try {
			await driver.dropTable(schemaName, tableName);
			onSuccess?.();
			closeModal();
		} catch (err) {
			setIsDeleting(false);
			setError(err instanceof Error ? err.message : "Failed to delete table");
		}
	};

	return (
		<Dialog.Root
			onOpenChange={(open: boolean) => {
				if (!open) {
					closeModal();
				}
			}}
			open={isOpen}
		>
			<Dialog className="p-6">
				<div className="mb-4 flex items-start justify-between gap-4">
					{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
					<Dialog.Title className="text-lg font-semibold">
						Delete table?
					</Dialog.Title>
				</div>

				<form onSubmit={handleSubmit}>
					<div className="space-y-4">
						{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
						<Dialog.Description className="text-kumo-subtle">
							Are you sure you want to delete the table{" "}
							<strong>{tableName}</strong>? This action cannot be undone.
						</Dialog.Description>

						<div className="space-y-2">
							<Text size="sm">
								Type <strong>{tableName}</strong> to confirm
							</Text>
							<input
								autoComplete="off"
								autoFocus
								className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
								onChange={(e) => setChallengeInput(e.target.value)}
								value={challengeInput}
							/>
						</div>

						{error && (
							<div className="rounded-md bg-red-50 p-3 text-red-700">
								{error}
							</div>
						)}
					</div>

					<div className="mt-4 flex justify-end gap-2">
						<Button onClick={closeModal} variant="secondary">
							Cancel
						</Button>

						<Button
							disabled={!isValid || isDeleting}
							loading={isDeleting}
							type="submit"
							variant="destructive"
						>
							Delete
						</Button>
					</div>
				</form>
			</Dialog>
		</Dialog.Root>
	);
}
