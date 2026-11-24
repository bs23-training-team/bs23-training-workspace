
import { AppShell } from "@/features/shell";

export default function PMLayout({ children }: LayoutProps<"/pm">) {
  return <AppShell role="PM">{children}</AppShell>;
}
