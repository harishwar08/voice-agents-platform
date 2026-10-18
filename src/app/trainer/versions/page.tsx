import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { trainerPages } from "@/lib/pages";

export default function TrainerVersionsPage() {
  return <AppSectionPage meta={trainerPages.versions} showEmpty={false} />;
}
