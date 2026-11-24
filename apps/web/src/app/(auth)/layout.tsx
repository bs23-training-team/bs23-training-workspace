import { GraduationCap } from "lucide-react";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-gradient-to-br from-brand-700 to-brand-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
            <GraduationCap className="h-6 w-6" aria-hidden />
          </span>
          <span className="text-lg font-semibold">BS23 Training Workspace</span>
        </div>
        <div>
          <p className="text-4xl font-semibold leading-tight">
            A space to learn.
            <br />A place to grow.
          </p>
          <p className="mt-4 max-w-md text-brand-100">Connect learning, work and progress in one workspace, where every number shows where it came from and how verified it is.</p>
        </div>
        <p className="text-sm text-brand-200">Brain Station 23 — Training &amp; Development</p>
      </div>
      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
