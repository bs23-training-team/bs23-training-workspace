import { AppShell } from "@/components/layout/app-shell";

export default function TraineeLayout({ children }: LayoutProps<"/trainee">) {
  return <AppShell role="TRAINEE">{children}</AppShell>;
}
