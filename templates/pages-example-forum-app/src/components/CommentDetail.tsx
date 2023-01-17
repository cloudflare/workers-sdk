import React from 'react';
import {
	Modal,
	Text,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalOverlay,
	HStack,
	VStack,
	Divider,
	Image,
	Textarea,
} from '@chakra-ui/react';
import { Comment as CommentType, SubComment } from 'types';
import Button from './shared/Button';
import { useAuth } from 'context/AuthContext';
import { timeDifferenceForDate } from 'utils/dateFormatter';

type Props = {
	isOpen: boolean;
	onClose: () => void;
	btnRef: React.RefObject<HTMLButtonElement>;
	comment: CommentType;
	handleUpdateComment: (comment: CommentType) => void;
};

// The CommentDetail component is a modal to show the details of a comment and allows the user to reply to the comment

const CommentDetail: React.FC<Props> = ({
	isOpen,
	onClose,
	btnRef,
	comment,
	handleUpdateComment,
}) => {
	const { user } = useAuth();
	const [subComment, setSubComment] = React.useState('');

	const handleSubmit = async () => {
		const newSubComment: SubComment = {
			user: user!,
			message: subComment,
			timestamp: new Date(),
		};

		const newComment = {
			...comment,
			comments: [...comment.comments, newSubComment],
		};
		handleUpdateComment(newComment);
		setSubComment('');
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			finalFocusRef={btnRef}
			scrollBehavior="inside"
			size={'xl'}
		>
			<ModalOverlay />
			<ModalContent>
				<ModalHeader>{comment.user.name}'s Comment</ModalHeader>
				<ModalCloseButton />
				<ModalBody minHeight="50vh">
					<VStack w="full" align="stretch" divider={<Divider />}>
						<Text my={2}>{comment.message}</Text>
						<VStack my={2} spacing={2}>
							<Textarea
								id="subComment"
								name="subComment"
								value={subComment}
								maxLength={40}
								onChange={(e: { target: { value: React.SetStateAction<string> } }) =>
									setSubComment(e.target.value)
								}
							/>
							<Button disabled={!user} onClick={handleSubmit} width="full">
								Add Comment
							</Button>
						</VStack>
						<VStack align="start" spacing={2} my={4}>
							{comment.comments.length === 0 ? (
								<Text color="gray.500">Be the first to comment on {comment.user.name}'s post</Text>
							) : (
								comment.comments.map(comment => (
									<VStack
										width="100%"
										height="100%"
										borderWidth={1}
										p={4}
										rounded="md"
										align="flex-start"
										key={comment.user.id}
									>
										<HStack align="start" spacing={3}>
											<Image
												src={comment.user.avatar_url}
												alt={comment.user.name}
												rounded="full"
												w={{ base: 10, md: 12 }}
											/>
											<VStack align="start" spacing={0}>
												<Text>{comment.user.name}</Text>
												<Text as="i" fontSize={{ base: 'xs', md: 'sm' }} color="gray.500">
													@{comment.user.username}
												</Text>
												<Text my={8} fontSize="xs" width="80%" noOfLines={2}>
													{timeDifferenceForDate(comment.timestamp)}
												</Text>
											</VStack>
										</HStack>
										<Text my={8} fontSize="sm" width="80%">
											{comment.message}
										</Text>
										<HStack align="end" spacing={3}></HStack>
									</VStack>
								))
							)}
						</VStack>
					</VStack>
				</ModalBody>

				<ModalFooter>
					<Button onClick={onClose}>Close</Button>
				</ModalFooter>
			</ModalContent>
		</Modal>
	);
};

export default CommentDetail;
