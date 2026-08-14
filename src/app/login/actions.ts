"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function messageUrl(message: string) {
  return `/login?message=${encodeURIComponent(message)}`;
}

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(messageUrl(error.message));
  redirect("/");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) redirect(messageUrl(error.message));
  redirect(messageUrl("Check your email to confirm your account, then sign in."));
}
