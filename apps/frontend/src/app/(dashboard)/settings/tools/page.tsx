import { redirect } from "next/navigation";

/** Legacy route from the previous console iteration — now Tools. */
export default function LegacyToolsSettingsPage() {
  redirect("/tools");
}
