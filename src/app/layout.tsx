import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";
import { IdentityBar } from "@/components/IdentityBar";
import { getCurrentUser, type CurrentUser } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/labels";

export const metadata: Metadata = {
  title: "DPIA Guide",
  description: "A guided Data Protection Impact Assessment demonstration. Fictional information only.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  let user: CurrentUser | null = null;
  try {
    user = await getCurrentUser();
  } catch {
    user = null; // pages show an understandable database message themselves
  }
  return (
    <html lang="en">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
        >
          Skip to main content
        </a>
        <div role="note" className="border-b border-amber-300 bg-amber-50 px-4 py-1 text-center text-xs text-amber-950">
          Demo environment — use fictional information only.
        </div>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-[88rem] flex-wrap items-center justify-between gap-2 px-4 py-2">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-lg font-semibold text-brand-700">
                DPIA Guide
              </Link>
              <span className="hidden text-sm text-ink-soft sm:inline">Harbour Financial Group (fictional)</span>
              {user ? (
                <Link href="/assessments" className="btn-link">
                  Assessments
                </Link>
              ) : null}
              {user?.roles.includes("ADMIN") ? (
                <Link href="/admin" className="btn-link">
                  Administration
                </Link>
              ) : null}
            </div>
            {user ? (
              <IdentityBar name={user.displayName} roles={user.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ")} />
            ) : (
              <span className="text-sm text-ink-soft">Not signed in to the demo</span>
            )}
          </div>
        </header>
        {children}
        <footer className="mx-auto max-w-[88rem] px-4 py-6 text-xs text-ink-soft">
          Educational demonstration. The demo identity is not authentication, and no result here is legal advice or a certification of lawfulness.
        </footer>
      </body>
    </html>
  );
}
