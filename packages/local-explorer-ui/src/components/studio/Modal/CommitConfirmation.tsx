import { Button, Dialog } from "@cloudflare/kumo";
import { PlayIcon, SpinnerIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { formatSqlError } from "../../../utils/studio/formatter";
import { CodeBlock } from "../Code/Block";

interface StudioCommitConfirmationProps {
	closeModal: () => void;
	isOpen: boolean;
	onConfirm: () => Promise<void>;
	statements: string[];
}

export function StudioCommitConfirmation({
	closeModal,
	isOpen,
	onConfirm,
	statements,
}: StudioCommitConfirmationProps) {
	const [errorMessage, setErrorMessage] = useState("");
	const [isRequesting, setIsRequesting] = useState(false);

	const handleConfirm = async (): Promise<void> => {
		setIsRequesting(true);
		setErrorMessage("");

		try {
			await onConfirm();
			closeModal();
		} catch (err) {
			setErrorMessage(formatSqlError(err));
		} finally {
			setIsRequesting(false);
		}
	};

	return (
		<Dialog.Root
			open={isOpen}
			onOpenChange={(open: boolean) => {
				if (!open) {
					closeModal();
				}
			}}
		>
			<Dialog className="p-6">
				<div className="mb-4 flex items-start justify-between gap-4">
					{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
					<Dialog.Title className="text-2xl font-semibold">
						Review and Confirm Changes
					</Dialog.Title>
				</div>

				{/* @ts-expect-error - Type mismatch due to pnpm monorepo @types/react version conflict */}
				<Dialog.Description className="text-kumo-subtle">
					<div className="flex flex-col gap-4 text-sm">
						{!!errorMessage && (
							<div className="font-mono text-red-500">{errorMessage}</div>
						)}

						<div>
							The following SQL statements will be executed to apply your
							changes. Please review them carefully before committing.
						</div>

						<CodeBlock
							code={statements.join("\n")}
							language="sql"
							maxHeight={500}
						/>
					</div>
				</Dialog.Description>

				<div className="mt-8 flex justify-end gap-2">
					<Button
						disabled={isRequesting}
						onClick={handleConfirm}
						variant="primary"
					>
						{isRequesting ? (
							<SpinnerIcon className="h-4 w-4 animate-spin" />
						) : (
							<PlayIcon className="h-4 w-4" />
						)}
						<span>Confirm & Execute</span>
					</Button>
				</div>
			</Dialog>
		</Dialog.Root>
	);
}
