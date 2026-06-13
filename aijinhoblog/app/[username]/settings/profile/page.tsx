import { notFound, redirect } from "next/navigation";

import { PageFrame } from "@/frontend/components/page-frame";
import { getCurrentUser } from "@/backend/auth";
import { profileSelect, serializeProfile } from "@/backend/profile";
import { prisma } from "@/backend/prisma";
import { ProfileSettingsForm } from "@/frontend/features/settings/profile-settings-form";

type Props = {
  params: Promise<{
    username: string;
  }>;
};

export default async function ProfileSettingsPage({ params }: Props) {
  const { username } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  if (currentUser.username !== username) {
    notFound();
  }

  const profile = await prisma.user.findUnique({
    where: {
      id: currentUser.id,
    },
    select: profileSelect,
  });

  if (!profile) {
    redirect("/login");
  }

  return (
    <PageFrame paddingClassName="py-10">
      <ProfileSettingsForm initialProfile={serializeProfile(profile)} />
    </PageFrame>
  );
}
