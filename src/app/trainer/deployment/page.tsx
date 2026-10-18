import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { trainerPages } from "@/lib/pages";

export default function TrainerDeploymentPage() {
  return <AppSectionPage meta={trainerPages.deployment} showEmpty={false} />;
}
