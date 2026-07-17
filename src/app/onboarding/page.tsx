import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/components/onboarding-flow";
import { getCurrentUser } from "@/lib/current-user";
import { STARTER_FEEDS } from "@/lib/starter-feeds";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (user.onboardingCompletedAt) {
    redirect("/");
  }

  return (
    <OnboardingFlow
      email={user.email}
      displayName={user.displayName}
      starterFeeds={STARTER_FEEDS}
    />
  );
}
