import type { User } from '@supabase/supabase-js';

const parseAdminEmails = (): string[] => {
  const raw = process.env.SUPER_ADMIN_EMAILS || process.env.SUPER_ADMINS || '';
  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
};

export const isSuperAdmin = (user: User | null): boolean => {
  if (!user?.email) return false;
  const allowed = parseAdminEmails();
  if (!allowed.length) return false;
  return allowed.includes(user.email.toLowerCase());
};
