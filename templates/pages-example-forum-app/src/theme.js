import { extendTheme } from '@chakra-ui/react';

export const theme = extendTheme({
	styles: {
		global: {
			'html, body': {
				lineHeight: 'tall',
				// backgroundColor: "gray.50",
				height: '100%',
			},
		},
	},
	config: {
		initialColorMode: 'dark',
		useSystemColorMode: true,
	},
});
