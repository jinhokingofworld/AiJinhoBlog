import { notFound, redirect } from "next/navigation";

import { PageFrame } from "@/frontend/components/page-frame";
import { getCurrentUser } from "@/backend/auth/session";
import { AccountSettingsClient } from "@/frontend/features/settings/account-settings-client";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{
    username: string;
  }>;
};

export default async function AccountSettingsPage({ params }: Props) {
  const { username } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  if (currentUser.username !== username) {
    notFound();
  }

  return (
    <PageFrame paddingClassName="py-10">
      <AccountSettingsClient initialAccount={currentUser} />
    </PageFrame>
  );
}
