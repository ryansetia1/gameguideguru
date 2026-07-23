/** Admin dashboard gate — must match RLS policies in db/*.sql */
export const ADMIN_EMAIL = "ryansetiawan.works@gmail.com";

export function isAdminEmail(email: string | null | undefined): boolean {
  return email === ADMIN_EMAIL;
}
