import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { trainerPages } from "@/lib/pages";

export default function TrainerConfigurationPage() {
  return <AppSectionPage meta={trainerPages.configuration} showEmpty={false} />;
}
