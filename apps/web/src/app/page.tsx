"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDB } from "@/lib/mock/store";
import { currentUser } from "@/lib/mock/selectors";
import { homeFor, useApiSession } from "@/features/auth";
import { Loading } from "@/components/ui/ui";

export default function Home() {
  const db = useDB();
  const router = useRouter();
  const session = useApiSession(); // the API decides who is signed in, not the mock store
  const user = currentUser(db);
  useEffect(() => {
    if (session === "checking") return;
    router.replace(session === "signed-in" && user ? homeFor(user.id) : "/login");
  }, [session, user, router]);
  return <Loading label="Opening workspace…" />;
}
