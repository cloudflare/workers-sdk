import { createFileRoute } from "@tanstack/react-router";
import { CronTriggersPage } from "../../components/cron-triggers/CronTriggersPage";
import type { JSX } from "react";

export const Route = createFileRoute("/cron-triggers/ad-hoc")({
	component: AdHocTriggersView,
});

function AdHocTriggersView(): JSX.Element {
	return <CronTriggersPage view="ad-hoc" />;
}
