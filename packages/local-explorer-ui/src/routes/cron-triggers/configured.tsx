import { createFileRoute } from "@tanstack/react-router";
import { CronTriggersPage } from "../../components/cron-triggers/CronTriggersPage";
import type { JSX } from "react";

export const Route = createFileRoute("/cron-triggers/configured")({
	component: ConfiguredCronsView,
});

function ConfiguredCronsView(): JSX.Element {
	return <CronTriggersPage view="configured" />;
}
