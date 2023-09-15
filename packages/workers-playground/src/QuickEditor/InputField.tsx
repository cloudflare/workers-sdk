import { createComponent } from "@cloudflare/style-container";
import { Input } from "@cloudflare/component-input";
import { isDarkMode } from "@cloudflare/style-const";
import { Listbox } from "@cloudflare/component-listbox";

export const InputField = createComponent(
	({ theme }) => ({
		flex: "auto",
		marginBottom: 0,
		borderRadius: 5,
		borderColor: isDarkMode() ? theme.colors.gray[3] : theme.colors.gray[7],
		backgroundColor: isDarkMode() ? theme.colors.gray[9] : theme.colors.white,
	}),
	Input
);
