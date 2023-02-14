import React, { useState } from 'react';
import {
	FormControl,
	FormLabel,
	FormHelperText,
	VStack,
	Textarea,
	useToast,
} from '@chakra-ui/react';
import commentServices from 'services/commentServices';
import { Comment } from 'types';
import { useAuth } from 'context/AuthContext';
import Loading from './Loading';
import Button from './shared/Button';

// Define proptypes
interface Props {
	handleAddComment: (comment: Comment) => void;
}

// The AddComment component is a form to send a comment to the server, which will then be added to the list of comments through Workers KV store
const AddComment: React.FC<Props> = ({ handleAddComment }) => {
	const { user, loading } = useAuth();
	const toast = useToast();
	const initialState = {
		message: '',
		likes: 0,
		comments: [],
		isLiked: false,
		timestamp: new Date(),
	};
	const [values, setValues] = useState(initialState);

	const handleChange = (e: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
		setValues({
			...values,
			[e.currentTarget.name]: e.currentTarget.value,
		});
	};

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		try {
			// Send the comment to the /api/form endpoint. The comment will be added to the list of comments in the Workers KV store
			const comment: Comment = await commentServices.postComment({
				user: user!,
				...values,
			});
			handleAddComment(comment); //Add the comment to the list of exsiting comments
			setValues(initialState);
			toast({
				title: 'Comment added',
				description: 'Your comment has been added',
				status: 'success',
				duration: 9000,
				isClosable: true,
				position: 'top-right',
			});
		} catch (error: any) {
			toast({
				title: 'Error adding comment',
				description: 'Something went wrong',
				variant: 'left-accent',
				position: 'top-right',
				status: 'error',
				duration: 4000,
				isClosable: true,
			});
		}
	};

	if (loading) {
		return <Loading />;
	}

	return (
		<form onSubmit={handleSubmit}>
			<VStack spacing={8} align="flex-start">
				<FormControl isRequired>
					<FormLabel htmlFor="message"> Comment</FormLabel>
					<Textarea
						id="message"
						name="message"
						placeholder="Share you thoughts with us"
						maxLength={80}
						height={40}
						value={values.message}
						onChange={handleChange}
					/>
					<FormHelperText>Make the comment as long as you'd like</FormHelperText>
				</FormControl>
				<Button type="submit" disabled={!user}>
					Send
				</Button>
			</VStack>
		</form>
	);
};

export default AddComment;
