import React from 'react';
import { chakra, Container, Icon } from '@chakra-ui/react';
import { isValidMotionProp, motion } from 'framer-motion';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';

const ChakraBox = chakra(motion.div, {
	shouldForwardProp: prop => isValidMotionProp(prop) || prop === 'children',
});

// Loading spinner for slower loading times
const Loading: React.FC = () => {
	return (
		<Container h="100vh" display="flex" alignItems="center" justifyContent="center">
			<ChakraBox
				margin="auto"
				width="24px"
				height="24px"
				animate={{ rotate: 360 }}
				// @ts-ignore
				transition={{
					duration: 56,
					ease: 'easeInOut',
					repeat: Infinity,
					repeatType: 'loop',
				}}
			>
				<Icon as={AiOutlineLoading3Quarters} w="inherit" height="inherit" />
			</ChakraBox>
		</Container>
	);
};

export default Loading;
