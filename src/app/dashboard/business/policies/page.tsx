import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { ownerPages } from "@/lib/pages";

export default function PoliciesPage() {
  return <AppSectionPage meta={ownerPages.policies} />;
}
