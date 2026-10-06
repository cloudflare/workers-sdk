import { Button } from "@cloudflare/kumo";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import type { JSX } from "react";

export const EMAIL_PAGE_SIZE = 24;

interface EmailPaginationProps {
	disabled: boolean;
	hasNext: boolean;
	hasPrevious: boolean;
	onNext: () => void;
	onPrevious: () => void;
}

export function EmailPagination({
	disabled,
	hasNext,
	hasPrevious,
	onNext,
	onPrevious,
}: EmailPaginationProps): JSX.Element {
	return (
		<div className="flex shrink-0 justify-end gap-2">
			<Button
				aria-label="Previous page"
				disabled={disabled || !hasPrevious}
				onClick={onPrevious}
				shape="square"
				variant="secondary"
			>
				<CaretLeftIcon size={18} />
			</Button>
			<Button
				aria-label="Next page"
				disabled={disabled || !hasNext}
				onClick={onNext}
				shape="square"
				variant="secondary"
			>
				<CaretRightIcon size={18} />
			</Button>
		</div>
	);
}
