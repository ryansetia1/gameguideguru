"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "gg_admin_token";

export async function loginAdmin(formData: FormData): Promise<void> {
  const password = formData.get("password");
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected || password !== expected) {
    throw new Error("Invalid admin password");
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "true", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 1 week
  });

  redirect("/admin");
}

export async function logoutAdmin() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  redirect("/admin");
}
