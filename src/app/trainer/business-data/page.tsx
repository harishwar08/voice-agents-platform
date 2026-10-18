import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { trainerPages } from "@/lib/pages";

export default function TrainerBusinessDataPage() {
  return <AppSectionPage meta={trainerPages.businessData} showEmpty={false} />;
}
