import type { PrismaClient } from "@/backend/generated/prisma";

import { hashPassword, verifyPassword } from "@/backend/auth-crypto";
import { prisma as defaultPrisma } from "@/backend/prisma";
import type { AccountSettingsInput, PasswordChangeInput } from "@/backend/validation";

export type SerializedAccount = {
  email: string;
  name: string;
  username: string;
};

export class AccountSettingsError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AccountSettingsError";
    this.status = status;
  }
}

const accountSelect = {
  email: true,
  name: true,
  username: true,
} as const;

export function serializeAccount(account: SerializedAccount): SerializedAccount {
  return {
    email: account.email,
    name: account.name,
    username: account.username,
  };
}

export async function updateAccountSettings({
  input,
  prisma = defaultPrisma,
  userId,
}: {
  input: AccountSettingsInput;
  prisma?: PrismaClient;
  userId: string;
}) {
  const current = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      email: true,
      passwordHash: true,
    },
  });

  if (!current) {
    throw new AccountSettingsError("사용자를 찾을 수 없습니다.", 404);
  }

  const emailChanged = input.email !== current.email;

  if (emailChanged && !verifyPassword(input.currentPassword, current.passwordHash)) {
    throw new AccountSettingsError("이메일을 변경하려면 현재 비밀번호가 필요합니다.", 401);
  }

  if (emailChanged) {
    const existingUser = await prisma.user.findUnique({
      where: {
        email: input.email,
      },
      select: {
        id: true,
      },
    });

    if (existingUser && existingUser.id !== userId) {
      throw new AccountSettingsError("이미 사용 중인 이메일입니다.", 409);
    }
  }

  const updated = await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      email: input.email,
      name: input.name,
    },
    select: accountSelect,
  });

  return serializeAccount(updated);
}

export async function changeAccountPassword({
  input,
  prisma = defaultPrisma,
  userId,
}: {
  input: PasswordChangeInput;
  prisma?: PrismaClient;
  userId: string;
}) {
  const current = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      passwordHash: true,
    },
  });

  if (!current) {
    throw new AccountSettingsError("사용자를 찾을 수 없습니다.", 404);
  }

  if (!verifyPassword(input.currentPassword, current.passwordHash)) {
    throw new AccountSettingsError("현재 비밀번호가 올바르지 않습니다.", 401);
  }

  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      passwordHash: hashPassword(input.newPassword),
    },
    select: {
      id: true,
    },
  });
}
