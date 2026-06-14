import { describe, expect, it, vi } from "vitest";

import {
  AccountSettingsError,
  changeAccountPassword,
  updateAccountSettings,
} from "@/backend/account-settings";
import { hashPassword, verifyPassword } from "@/backend/auth-crypto";

describe("account settings", () => {
  it("updates name and email when current password is valid", async () => {
    const passwordHash = hashPassword("current-password");
    const prisma = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            email: "old@example.com",
            passwordHash,
          })
          .mockResolvedValueOnce(null),
        update: vi.fn().mockResolvedValue({
          email: "new@example.com",
          name: "새 이름",
          username: "jinho",
        }),
      },
    };

    const account = await updateAccountSettings({
      input: {
        currentPassword: "current-password",
        email: "new@example.com",
        name: "새 이름",
      },
      prisma: prisma as never,
      userId: "user-1",
    });

    expect(account).toEqual({
      email: "new@example.com",
      name: "새 이름",
      username: "jinho",
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          email: "new@example.com",
          name: "새 이름",
        },
      }),
    );
  });

  it("rejects email changes without the current password", async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          email: "old@example.com",
          passwordHash: hashPassword("current-password"),
        }),
      },
    };

    await expect(
      updateAccountSettings({
        input: {
          currentPassword: "wrong-password",
          email: "new@example.com",
          name: "김진호",
        },
        prisma: prisma as never,
        userId: "user-1",
      }),
    ).rejects.toMatchObject<AccountSettingsError>({
      status: 401,
    });
  });

  it("changes password using a fresh hash", async () => {
    const oldHash = hashPassword("current-password");
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          passwordHash: oldHash,
        }),
        update: vi.fn().mockResolvedValue({
          id: "user-1",
        }),
      },
    };

    await changeAccountPassword({
      input: {
        currentPassword: "current-password",
        newPassword: "next-password",
      },
      prisma: prisma as never,
      userId: "user-1",
    });

    const nextHash = prisma.user.update.mock.calls[0]?.[0]?.data?.passwordHash as string;

    expect(nextHash).not.toBe(oldHash);
    expect(verifyPassword("next-password", nextHash)).toBe(true);
  });
});
