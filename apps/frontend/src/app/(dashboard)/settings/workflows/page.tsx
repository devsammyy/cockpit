import { redirect } from "next/navigation";

/** Legacy route from the previous console iteration — now Workflows. */
export default function LegacyWorkflowsSettingsPage() {
  redirect("/workflows");
}
