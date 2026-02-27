// src/lib/admin.ts
export const ADMIN_EMAILS = new Set(["delvin.akins@gmail.com"]);

export function isAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  return ADMIN_EMAILS.has(String(email).trim().toLowerCase());
}