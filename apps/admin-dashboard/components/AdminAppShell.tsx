"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog, DialogBackdrop, DialogPanel, TransitionChild } from "@headlessui/react";
import {
  BarChart3,
  Briefcase,
  Bug,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Menu,
  Search,
  Settings,
  Users,
  Wallet,
  X,
} from "lucide-react";
import LogoDark from "@/public/logo.webp";
import LogoLight from "@/public/logo-light.webp";
import { useEffect, useMemo, useState } from "react";
import CommandPalette from "@/components/CommandPalette";
import JobsIndicator from "@/components/JobsIndicator";
import LogoutButton from "@/components/LogoutButton";

type AdminAppShellProps = {
  children: React.ReactNode;
};

type NavigationItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  match?: "exact" | "prefix";
};

const navigation: NavigationItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, match: "exact" },
  { name: "Clients", href: "/clients", icon: Briefcase },
  { name: "Projects", href: "/projects", icon: FolderKanban },
  { name: "Time Tracking", href: "/time", icon: Wallet },
  { name: "Invoices", href: "/invoices", icon: FileText },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Users", href: "/users", icon: Users },
];

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function isActivePath(pathname: string, item: NavigationItem) {
  if (item.match === "exact") {
    return pathname === item.href;
  }

  if (item.href === "/") {
    return pathname === "/";
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function SidebarContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <div className="flex grow flex-col gap-y-6 overflow-y-auto bg-white px-6 pb-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex h-16 shrink-0 items-center border-b border-slate-200 dark:border-white/10">
        <Link href="/" className="flex items-center gap-3" onClick={onNavigate}>
          <Image
            src={LogoLight}
            alt="Freelance OS"
            width={144}
            height={36}
            priority
            className="h-9 w-auto dark:hidden"
          />
          <Image
            src={LogoDark}
            alt="Freelance OS"
            width={144}
            height={36}
            priority
            className="h-9 w-auto hidden dark:block"
          />
          <div>
            <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">Freelance OS</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Admin Dashboard</div>
          </div>
        </Link>
      </div>

      {/* <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/10">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Current workspace</p>
        <p className="mt-2 text-sm font-semibold text-white">{activeNavLabel}</p>
        <p className="mt-1 text-sm text-slate-400">Manage clients, projects, billing, and operations from one place.</p>
      </div> */}

      <nav className="flex flex-1 flex-col">
        <ul role="list" className="flex flex-1 flex-col gap-y-6">
          <li>
            <div className="mb-2 px-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Navigation</div>
            <ul role="list" className="space-y-1">
              {navigation.map((item) => {
                const active = isActivePath(pathname, item);
                const Icon = item.icon;

                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={classNames(
                        active
                          ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200 dark:bg-blue-500/15 dark:text-white dark:ring-blue-400/30"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white",
                        "group flex items-center gap-x-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
                      )}
                    >
                      <Icon
                        className={classNames(
                          active
                            ? "text-blue-600 dark:text-blue-300"
                            : "text-slate-400 group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-300",
                          "h-5 w-5 shrink-0"
                        )}
                      />
                      <span>{item.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>

          <li className="mt-auto flex flex-col gap-y-1">
            {/* { name: "Debug", href: "/debug", icon: Bug }, */}
            <Link
              href="/debug"
              onClick={onNavigate}
              className={classNames(
                isActivePath(pathname, { name: "Debug", href: "/debug", icon: Bug })
                  ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200 dark:bg-blue-500/15 dark:text-white dark:ring-blue-400/30"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white",
                "group flex items-center gap-x-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
              )}
            >
              <Bug className="h-5 w-5 shrink-0 text-slate-400 group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-300" />
              <span>Debug</span>
            </Link>
            <Link
              href="/settings"
              onClick={onNavigate}
              className={classNames(
                isActivePath(pathname, { name: "Settings", href: "/settings", icon: Settings })
                  ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200 dark:bg-blue-500/15 dark:text-white dark:ring-blue-400/30"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white",
                "group flex items-center gap-x-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
              )}
            >
              <Settings className="h-5 w-5 shrink-0 text-slate-400 group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-300" />
              <span>Settings</span>
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}

export default function AdminAppShell({ children }: AdminAppShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const isLoginPage = pathname === "/login";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      if (event.key === "/") {
        const activeElement = document.activeElement;
        const isTypingTarget =
          activeElement instanceof HTMLInputElement ||
          activeElement instanceof HTMLTextAreaElement ||
          activeElement instanceof HTMLSelectElement ||
          activeElement?.getAttribute("contenteditable") === "true";

        if (!isTypingTarget) {
          event.preventDefault();
          setCommandPaletteOpen(true);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />

      <Dialog open={sidebarOpen} onClose={setSidebarOpen} className="relative z-50 lg:hidden">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-300 ease-linear data-closed:opacity-0"
        />

        <div className="fixed inset-0 flex">
          <DialogPanel
            transition
            className="relative mr-16 flex w-full max-w-xs flex-1 transform transition duration-300 ease-in-out data-closed:-translate-x-full"
          >
            <TransitionChild>
              <div className="absolute top-0 left-full flex w-16 justify-center pt-5 duration-300 ease-in-out data-closed:opacity-0">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
                >
                  <span className="sr-only">Close sidebar</span>
                  <X className="h-6 w-6" />
                </button>
              </div>
            </TransitionChild>

            <SidebarContent pathname={pathname} onNavigate={() => setSidebarOpen(false)} />
          </DialogPanel>
        </div>
      </Dialog>

      <div className="hidden lg:fixed lg:inset-y-0 lg:z-40 lg:flex lg:w-72 lg:flex-col lg:border-r lg:border-slate-200 lg:bg-white dark:lg:border-white/10 dark:lg:bg-slate-950">
        <SidebarContent pathname={pathname} />
      </div>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-gray-200/80 bg-white/90 backdrop-blur dark:border-white/10 dark:bg-gray-900/85">
          <div className="flex h-16 items-center gap-x-4 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="-m-2.5 rounded-lg p-2.5 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 lg:hidden dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
            >
              <span className="sr-only">Open sidebar</span>
              <Menu className="h-6 w-6" />
            </button>

            <div aria-hidden="true" className="h-6 w-px bg-gray-200 lg:hidden dark:bg-white/10" />

            <div className="flex flex-1 items-center gap-x-4 lg:gap-x-6">
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                className="group grid flex-1 grid-cols-1"
                aria-label="Open command palette"
              >
                <div className="col-start-1 row-start-1 flex h-11 items-center rounded-xl border border-gray-200 bg-gray-50 px-3 text-left text-sm text-gray-500 shadow-sm transition group-hover:border-blue-300 group-hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-gray-400 dark:group-hover:border-blue-400/40 dark:group-hover:bg-white/10">
                  <Search className="mr-3 h-4 w-4 text-gray-400 dark:text-gray-500" />
                  <span className="truncate">Search or jump to…</span>
                  <span className="ml-auto hidden rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-400 sm:inline dark:border-white/10 dark:bg-gray-900 dark:text-gray-500">
                    ⌘K
                  </span>
                </div>
              </button>

              <div className="flex items-center gap-x-2 sm:gap-x-3">
                <JobsIndicator />
                <div className="flex items-center gap-3 px-2 py-1">
                  <div className="hidden text-right sm:block">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Admin</p>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white shadow-md shadow-blue-950/30">
                    A
                  </div>
                  <LogoutButton />
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-4rem)] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}