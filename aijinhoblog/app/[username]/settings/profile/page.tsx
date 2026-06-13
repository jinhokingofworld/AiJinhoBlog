import { notFound, redirect } from "next/navigation";

import { PageFrame } from "@/app/_components/page-frame";
import { getCurrentUser } from "@/lib/auth";
import { profileSelect, serializeProfile } from "@/lib/profile";
import { prisma } from "@/lib/prisma";

import { ProfileSettingsForm } from "./profile-settings-form";

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
