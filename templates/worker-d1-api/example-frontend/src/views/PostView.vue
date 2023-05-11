<template>
	<div class="post" v-if="post">
		<h1 v-text="post.title" />
		<p v-text="post.content" />

		<h3>Comments (<span v-text="post.comments ? post.comments.length : 0" />)</h3>

		<form v-on:submit="submitComment">
			<textarea
				required
				placeholder="Write your comment"
				v-model="comment.body"
				cols="40"
				rows="4"
			/>
			<input required type="text" placeholder="Your name" v-model="comment.author" />
			<input type="submit" />
		</form>

		<span v-if="!post.comments && loadingComments">Loading comments...</span>

		<div v-if="post.comments">
			<div v-for="comment in post.comments">
				<p v-text="sanitize(comment.body)"></p>
				<p>
					<em>- {{ sanitize(comment.author) }}</em>
				</p>
			</div>
		</div>
	</div>
</template>

<script type="module">
	const posts = {
		'hello-world': {
			title: 'Hello World!',
			content: 'Testing, one two',
			slug: 'hello-world',
		},
	};

	export default {
		data() {
			return {
				comment: {
					author: '',
					body: '',
				},
				post: null,
				loadingComments: false,
			};
		},

		mounted() {
			const param = this.$route.params.post;
			if (posts[param]) {
				this.post = posts[param];
				this.loadComments();
			} else {
				throw new Error("Couldn't find post");
			}
		},

		methods: {
			async loadComments() {
				this.loadingComments = true;
				const resp = await fetch(
					`https://d1-example.signalnerve.workers.dev/api/posts/${this.post.slug}/comments`
				);
				const comments = await resp.json();
				this.post.comments = comments;
				this.loadingComments = false;
			},

			async submitComment(evt) {
				evt.preventDefault();

				const newComment = {
					body: this.sanitize(this.comment.body),
					author: this.sanitize(this.comment.author),
				};

				const resp = await fetch(
					`https://d1-example.signalnerve.workers.dev/api/posts/${this.post.slug}/comments`,
					{
						method: 'POST',
						body: JSON.stringify(newComment),
					}
				);

				if (resp.status == 201) this.post.comments.push(newComment);

				this.comment.author = '';
				this.comment.body = '';
			},

			sanitize(str) {
				str = str.replace(/[^a-z0-9áéíóúñü \.,_-]/gim, '');
				return str.trim();
			},
		},
	};
</script>
