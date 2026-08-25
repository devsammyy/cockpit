import { redirect } from "next/navigation";

/** Legacy route from the previous console iteration — now Memory. */
export default function LegacyMemorySettingsPage() {
  redirect("/memory");
}
