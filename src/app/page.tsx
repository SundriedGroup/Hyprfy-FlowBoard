import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Flowboard } from "@/components/flowboard";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  return <Flowboard userId={userId} userEmail={typeof data.claims.email === "string" ? data.claims.email : ""} />;
}
