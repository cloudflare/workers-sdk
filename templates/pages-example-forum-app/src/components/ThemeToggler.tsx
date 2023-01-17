import { useColorMode, IconButton } from '@chakra-ui/react';
import { SunIcon, MoonIcon } from '@chakra-ui/icons';

export default function ThemeToggler(props: any) {
	const { colorMode, toggleColorMode } = useColorMode();
	return (
		<IconButton
			colorScheme="black"
			aria-label="Toggle Color Mode"
			icon={colorMode === 'light' ? <MoonIcon /> : <SunIcon />}
			borderRadius="full"
			variant="ghost"
			onClick={toggleColorMode}
			{...props}
		/>
	);
}
