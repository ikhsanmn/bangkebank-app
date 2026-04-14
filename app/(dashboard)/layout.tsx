import type { ReactNode } from "react";
import { Bell, Search } from "lucide-react";

import { AppSidebar } from "@/components/horizon/app-sidebar";
import { MobileNav } from "@/components/horizon/mobile-nav";
import { SignOutButton } from "@/components/horizon/sign-out-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireServerSession } from "@/lib/session";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireServerSession();
  const firstName =
    ("firstName" in session.user && typeof session.user.firstName === "string"
      ? session.user.firstName
      : session.user.name.split(" ")[0]) || "there";

  return (
    <div className="min-h-screen lg:flex">
      <AppSidebar />
      <div className="flex-1">
        <header className="sticky top-0 z-20 border-b border-border/50 bg-[#fbf8f2]/85 backdrop-blur">
          <div className="container flex flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm text-slate-500">
                Good morning, {firstName}
              </p>
              <MobileNav />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:min-w-[280px]">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input className="pl-11" placeholder="Search transactions, banks, recipients" />
              </div>
              <Button variant="outline" size="icon">
                <Bell className="size-4" />
              </Button>
              <SignOutButton />
            </div>
          </div>
        </header>
        <main className="container py-8">{children}</main>
      </div>
    </div>
  );
}
