import { Icon } from "@cloudflare/component-icon";
import { A, Span } from "@cloudflare/elements";
import { isDarkMode } from "@cloudflare/style-const";
import { createStyledComponent } from "@cloudflare/style-container";
import type React from "react";

const Link = createStyledComponent(
	({ theme }) => ({
		display: "inline-flex",
		alignItems: "center",
		width: "fit-content",
		fontSize: theme.fontSizes[1],
		color: `${theme.colors.indigo[isDarkMode() ? 9 : 2]} !important`,
		backgroundColor: theme.colors.indigo[isDarkMode() ? 4 : 9],
		borderRadius: "100vw",
		px: 2,
		py: "1px",
		textDecoration: "none",
		lineHeight: 1.5,
		verticalAlign: "bottom",
		gap: 2,
		"& svg": {
			color: theme.colors.indigo[isDarkMode() ? 9 : 4],
		},
		"&:hover svg": {
			color: theme.colors.indigo[isDarkMode() ? 9 : 2],
		},
	}),
	A
);

type Props = React.ComponentProps<typeof Link>;

export const DocsLink: React.FC<Props> = ({ children, ...props }) => (
	<Link target="_blank" {...props} rel="noopener noreferrer">
		<Span display="flex" flex="none" alignItems="center">
			<Icon type="documentation" label="documentation" size={12} />
		</Span>

		{children}
	</Link>
);
