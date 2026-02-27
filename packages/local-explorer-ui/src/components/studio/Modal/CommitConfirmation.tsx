import { Button, Dialog } from "@cloudflare/kumo";
import { PlayIcon, SpinnerIcon } from "@phosphor-icons/react";
import { useState } from "react";
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
			if (err instanceof Error) {
				setErrorMessage(err.message);
			} else {
				setErrorMessage(String(err));
			}
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
			<Dialog>
				{/* @ts-expect-error `@cloudflare/kumo` currently has a type def bug here */}
				<Dialog.Title>Review and Confirm Changes</Dialog.Title>

				<div className="flex flex-col gap-4 text-sm">
					{!!errorMessage && (
						<div className="font-mono text-red-500">{errorMessage}</div>
					)}

					<div>
						The following SQL statements will be executed to apply your changes.
						Please review them carefully before committing.
					</div>

					<CodeBlock
						code={statements.join("\n")}
						language="sql"
						maxHeight={500}
					/>
				</div>

				<div className="mt-4 flex justify-end gap-2">
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
