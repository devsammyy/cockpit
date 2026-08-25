import { redirect } from "next/navigation";

/** Legacy route from the previous console iteration — now Agents & Models. */
export default function LegacyAiSettingsPage() {
  redirect("/agents");
}
