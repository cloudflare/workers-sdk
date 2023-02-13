import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { useToast } from '@chakra-ui/toast';
import authService from '../services/authService';
import Loading from '../components/Loading';
import { User } from 'types';

type AuthContextType = {
	login: () => Promise<void>;
	logout: () => void;
	user: User | null;
	loading: boolean;
};

const AuthContext = createContext<AuthContextType | null>(null);

type Props = {
	children: ReactNode;
};

export const AuthProvider: React.FC<Props> = ({ children }) => {
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);
	const [reload, setReload] = useState(false);

	const refetch = () => setReload(reload => !reload);

	const toast = useToast();

	const getCurrentUser = async () => {
		const response = await authService.getUser();
		setUser(response);
		setLoading(false);
	};

	useEffect(() => {
		getCurrentUser();
	}, [reload]);

	// Handle user login by sending a request to the /api/code endpoint
	const login = async () => {
		try {
			const response = await authService.loginViaGithub();
			// Set user information in the local storage and set current user to state
			localStorage.setItem('token', response.jwtToken);
			window.history.pushState({}, '', process.env.REACT_APP_REDIRECT_URL);
			refetch();
		} catch (error) {
			toast({
				title: 'Error',
				variant: 'left-accent',
				position: 'top-right',
				description: 'Error logging in',
				status: 'error',
				isClosable: true,
				duration: 4000,
			});
		}
	};

	const logout = () => {
		localStorage.removeItem('token');
		setUser(null);
		refetch();
	};

	if (loading) {
		return <Loading />;
	}

	return (
		<AuthContext.Provider value={{ login, user, loading, logout }}>{children}</AuthContext.Provider>
	);
};

export const useAuth = () => {
	return useContext(AuthContext) as AuthContextType;
};
