import type { FC } from 'react';

export const ExternalLink: FC<{ href: string; className?: string }> = ({
	href,
	className,
	children,
}) => {
	return (
		<a href={href} target="_blank" rel="noopener noreferrer" className={className}>
			{children}
		</a>
	);
};
