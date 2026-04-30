import { config } from "../config.js";

const normalizedPlatformAdminEmails = (): string[] =>
  config.platformAdminEmails.map((entry) => entry.trim().toLowerCase()).filter(Boolean);

export const isPlatformAdminEmail = (email: string | null | undefined): boolean => {
  if (!email) return false;
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return false;
  return normalizedPlatformAdminEmails().includes(normalizedEmail);
};
