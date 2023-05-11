import React, { useState } from 'react';
import {
	HStack,
	Text,
	VStack,
	IconButton,
	useDisclosure,
	Button,
	Image,
	Icon,
} from '@chakra-ui/react';
import { AiFillHeart, AiOutlineHeart } from 'react-icons/ai';
import { BiExpand } from 'react-icons/bi';
import { FaRegComment } from 'react-icons/fa';
import commentServices from '../services/commentServices';
import { Comment as CommentType, Operation } from 'types';
import { useAuth } from 'context/AuthContext';
import CommentDetail from './CommentDetail';
import { timeDifferenceForDate } from 'utils/dateFormatter';

type ButtonProps = {
	icon: React.ReactNode;
	handleClick: () => void;
	text: number | string;
	disabled: boolean;
};
const CommentIconButton: React.FC<ButtonProps> = ({ icon, handleClick, text, disabled }) => (
	<HStack
		as={Button}
		variant="unstyled"
		align="center"
		spacing={1}
		onClick={handleClick}
		disabled={disabled}
	>
		{icon}
		<Text color="gray.500" fontSize="sm">
			{text}
		</Text>
	</HStack>
);
interface Props {
	comment: CommentType;
}

const Comment: React.FC<Props> = ({ comment }) => {
	const { isOpen, onOpen, onClose } = useDisclosure();
	const [mainComment, setMainComment] = useState(comment);
	const { user } = useAuth(); //Get the user from the context
	const btnRef = React.useRef<HTMLButtonElement>(null);

	const handleUpdateComment = async (comment = mainComment) => {
		try {
			const updatedComment = await commentServices.updateComment(comment);
			setMainComment(updatedComment);
		} catch (error) {
			console.log('error');
		}
	};
	// The function below checks if the user comment is liked or not. If it is liked, it will change the icon to a filled heart.
	const handleLikes = async () => {
		try {
			let operation: Operation = mainComment.isLiked ? 'decrement' : 'increment';
			const likes = await commentServices.updateLikesByID(mainComment.uuid, operation);
			await handleUpdateComment({
				...mainComment,
				likes,
				isLiked: !mainComment.isLiked,
			});
		} catch (error: any) {
			console.log('error', error.message);
		}
	};

	return (
		<VStack width="100%" height="100%" borderWidth={1} p={4} rounded="md" align="flex-start">
			<HStack align="center" justify="space-between" width="100%">
				<HStack align="start" spacing={3}>
					<Image
						src={comment.user.avatar_url}
						alt={mainComment.user.name}
						rounded="full"
						w={{ base: 10, md: 12 }}
					/>
					<VStack align="start" spacing={0}>
						<Text>{mainComment.user.name}</Text>
						<Text as="i" fontSize={{ base: 'xs', md: 'sm' }} color="gray.500">
							@{mainComment.user.username}
						</Text>
						<Text my={8} fontSize="xs" width="80%" noOfLines={2}>
							{timeDifferenceForDate(mainComment.timestamp)}
						</Text>
					</VStack>
				</HStack>
				<IconButton
					ref={btnRef}
					icon={<BiExpand size={15} />}
					onClick={onOpen}
					aria-label="Edit button"
					variant="unstyled"
				/>
			</HStack>
			<Text my={8} fontSize="sm" width="80%" noOfLines={2}>
				{mainComment.message}
			</Text>

			<HStack align="center" spacing={4}>
				<CommentIconButton
					icon={
						<Icon
							aria-label="Like button"
							as={mainComment.isLiked ? AiFillHeart : AiOutlineHeart}
						/>
					}
					handleClick={handleLikes}
					text={mainComment.likes}
					disabled={!user}
				/>
				<CommentIconButton
					icon={<Icon aria-label="Like button" as={FaRegComment} />}
					handleClick={onOpen}
					text={mainComment.comments.length}
					disabled={false}
				/>
			</HStack>
			<CommentDetail
				isOpen={isOpen}
				onClose={onClose}
				btnRef={btnRef}
				handleUpdateComment={handleUpdateComment}
				comment={mainComment}
			/>
		</VStack>
	);
};

export default Comment;
