import React from 'react';
import { Flex, Icon, Image, Link, useColorMode, Box, IconButton } from '@chakra-ui/react';
import { AiFillGithub, AiFillBook } from 'react-icons/ai';
import { MdLogout } from 'react-icons/md';
import { useAuth } from '../context/AuthContext';
import { getFormattedGithubUrl } from '../utils/urlFormatter';
import Button from './shared/Button';
import ThemeToggler from './ThemeToggler';

// Component to display the user's profile and logout button if authenticated

const Navbar: React.FC = () => {
	const { user, logout } = useAuth();
	const [show, setShow] = React.useState(false);
	return (
		<Flex align="center" justify="space-between" px={4} py={2} boxShadow="sm">
			<Icon as={AiFillBook} w={8} h={8} />
			<ThemeToggler display={{ base: 'none', md: 'flex' }} align="center" mr={3} />
			{user ? (
				<Flex gap={4}>
					<Image src={user.avatar_url} alt={user.name} width="40px" height="40px" rounded="full" />
					<Button
						backgroundColor="black"
						sx={{
							'textDecoration': 'none',
							':hover': {
								textDecoration: 'none',
								backgroundColor: 'black',
							},
						}}
						color="white"
						leftIcon={<Icon as={MdLogout} />}
						onClick={logout}
					>
						Logout
					</Button>
				</Flex>
			) : (
				<Button
					as={Link}
					//@ts-ignore
					href={getFormattedGithubUrl()}
					backgroundColor="black"
					sx={{
						'textDecoration': 'none',
						':hover': {
							textDecoration: 'none',
							backgroundColor: 'black',
						},
					}}
					color="white"
					leftIcon={<Icon as={AiFillGithub} />}
				>
					Login
				</Button>
			)}
		</Flex>
	);
};

export default Navbar;
