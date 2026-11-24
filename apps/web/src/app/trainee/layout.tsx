
import { AppShell } from "@/features/shell";

export default function TraineeLayout({ children }: LayoutProps<"/trainee">) {
  return <AppShell role="TRAINEE">{children}</AppShell>;
}
