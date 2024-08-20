import { Div } from "@cloudflare/elements";
import type React from "react";

export const StepNumber: React.FC<{
	number: React.ReactNode;
	active?: boolean;
	complete?: boolean;
}> = ({ number, active, complete }) => (
	<Div
		display="inline-flex"
		justifyContent="center"
		alignItems="center"
		flex="none"
		width={26}
		height={26}
		mr={2}
		fontWeight="bold"
		lineHeight={1}
		border="1px solid"
		borderRadius="50%"
		borderColor={active || complete ? "blue.4" : "gray.7"}
		color={active ? "#fff" : complete ? "blue.4" : "gray.4"}
		backgroundColor={active ? "blue.4" : "transparent"}
		userSelect="none"
	>
		{number}
	</Div>
);
