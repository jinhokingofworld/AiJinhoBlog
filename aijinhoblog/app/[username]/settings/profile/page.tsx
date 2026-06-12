import { notFound, redirect } from "next/navigation";

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
    <main className="min-h-screen bg-[#f8f7f4] px-5 py-10 text-zinc-950">
      <ProfileSettingsForm initialProfile={serializeProfile(profile)} />
    </main>
  );
}
