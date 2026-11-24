import { AppShell } from "@/components/layout/app-shell";

export default function PMLayout({ children }: LayoutProps<"/pm">) {
  return <AppShell role="PM">{children}</AppShell>;
}
