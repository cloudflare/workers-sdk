import { Button, Dialog } from "@cloudflare/kumo";
import { PlayIcon, SpinnerIcon } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { CodeBlock } from "../Code/Block";

interface Props {
	closeModal: () => void;
	isOpen: boolean;
	onConfirm: () => Promise<void>;
	statements: string[];
}

export function StudioCommitConfirmation(props: Props) {
	const [errorMessage, setErrorMessage] = useState<string>("");
	const [isRequesting, setIsRequesting] = useState<boolean>(false);

	const onConfirm = useCallback(async () => {
		setIsRequesting(true);
		try {
			await props.onConfirm();
			props.closeModal();
		} finally {
			setIsRequesting(false);
		}
	}, [props]);

	return (
		<Dialog.Root
			open={!!props.isOpen}
			onOpenChange={(open: boolean) => {
				if (!open) {
					props.closeModal();
				}
			}}
		>
			<Dialog>
				<Dialog.Title>Review and Confirm Changes</Dialog.Title>

				<div className="flex flex-col gap-4 text-sm">
					{!!errorMessage && (
						<div className="text-red-500 font-mono">{errorMessage}</div>
					)}

					<div>
						The following SQL statements will be executed to apply your changes.
						Please review them carefully before committing.
					</div>

					<CodeBlock
						code={props.statements.join("\n")}
						language="sql"
						maxHeight={500}
					/>
				</div>

				<div className="flex gap-2 justify-end mt-4">
					<Button
						disabled={isRequesting}
						onClick={async () => {
							setIsRequesting(true);

							try {
								await onConfirm();
								props.closeModal();
							} catch (err) {
								if (err instanceof Error) {
									setErrorMessage(err.message);
								} else {
									setErrorMessage(String(err));
								}
							} finally {
								setIsRequesting(false);
							}
						}}
						variant="primary"
					>
						{isRequesting ? (
							<SpinnerIcon className="w-4 h-4 animate-spin" />
						) : (
							<PlayIcon className="w-4 h-4" />
						)}
						<span>Confirm & Execute</span>
					</Button>
				</div>
			</Dialog>
		</Dialog.Root>
	);
}
