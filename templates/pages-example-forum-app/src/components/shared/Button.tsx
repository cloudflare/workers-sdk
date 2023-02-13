import { Button as ChakraButton, ButtonProps } from '@chakra-ui/react';
import React from 'react';

const Button: React.FC<ButtonProps> = ({ children, ...props }) => {
	return (
		<ChakraButton
			backgroundColor="black"
			sx={{
				'textDecoration': 'none',
				':hover': {
					textDecoration: 'none',
					backgroundColor: 'black',
				},
			}}
			color="white"
			{...props}
		>
			{children}
		</ChakraButton>
	);
};

export default Button;
