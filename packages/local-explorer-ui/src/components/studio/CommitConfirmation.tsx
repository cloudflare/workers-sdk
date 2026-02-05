import CodeBlock from "@cloudflare/component-code-block";
import { Button } from "@cloudflare/kumo";
import { PlayIcon, SpinnerIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { ConfirmationModal } from "../../utils/studio/stubs/ui/ConfirmationModal";

type Props = {
	isOpen: boolean;
	onConfirm: () => Promise<void>;
	closeModal: () => void;
	statements: string[];
};

export function StudioCommitConfirmation({
	onConfirm,
	closeModal,
	isOpen,
	statements,
}: Props) {
	const [errorMessage, setErrorMessage] = useState("");
	const [isRequesting, setIsRequesting] = useState(false);

	return (
		<ConfirmationModal
			simple
			title="Review and Confirm Changes"
			isOpen={isOpen}
			closeModal={closeModal}
			onConfirm={onConfirm}
			width={"wide"}
			body={
				<div style={{ fontSize: 14 }} className="flex flex-col gap-4">
					{!!errorMessage && (
						<div className="text-red-500 font-mono">{errorMessage}</div>
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
			}
			actions={(ctx) => {
				return (
					<Button
						onClick={() => {
							setIsRequesting(true);
							onConfirm()
								.then(() => {
									ctx.closeModal();
								})
								.catch((e) => {
									if (e instanceof Error) {
										setErrorMessage(e.message);
									} else {
										setErrorMessage(e.toString());
									}
								})
								.finally(() => {
									setIsRequesting(false);
								});
						}}
						disabled={isRequesting}
						variant="primary"
					>
						{isRequesting ? (
							<SpinnerIcon className="w-4 h-4 animate-spin" />
						) : (
							<PlayIcon className="w-4 h-4" />
						)}
						{"Confirm & Execute"}
					</Button>
				);
			}}
		></ConfirmationModal>
	);
}
