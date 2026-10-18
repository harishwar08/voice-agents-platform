import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { ownerPages } from "@/lib/pages";

export default function InventoryPage() {
  return <AppSectionPage meta={ownerPages.inventory} />;
}
