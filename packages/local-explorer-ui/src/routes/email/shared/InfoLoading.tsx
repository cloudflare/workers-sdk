import { LayerCard, SkeletonLine } from "@cloudflare/kumo";

/**
 * Skeleton placeholder rendered while an Email Detail page resolves its
 * data. Matches the layout of the detail view so the loading state is consistent.
 */
export const InfoLoading = () => (
	<>
		<LayerCard>
			<LayerCard.Secondary>Lifecycle</LayerCard.Secondary>
			<LayerCard.Primary>
				<SkeletonLine />
				<SkeletonLine />
				<SkeletonLine />
				<SkeletonLine />
				<SkeletonLine />
			</LayerCard.Primary>
		</LayerCard>
		<LayerCard>
			<LayerCard.Secondary>Message</LayerCard.Secondary>
			<LayerCard.Primary>
				<SkeletonLine />
				<SkeletonLine />
				<SkeletonLine />
			</LayerCard.Primary>
		</LayerCard>
	</>
);
