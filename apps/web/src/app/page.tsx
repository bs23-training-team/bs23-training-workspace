"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDB } from "@/lib/mock/store";
import { currentUser } from "@/lib/mock/selectors";
import { homeFor } from "@/features/auth";
import { Loading } from "@/components/ui/ui";

export default function Home() {
  const db = useDB();
  const router = useRouter();
  const user = currentUser(db);
  useEffect(() => {
    router.replace(user ? homeFor(user.id) : "/login");
  }, [user, router]);
  return <Loading label="Opening workspace…" />;
}
