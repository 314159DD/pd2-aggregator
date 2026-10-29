import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountSkeleton, AccountView } from "@/components/builds/AccountView";

export const metadata: Metadata = { title: "Account | PD2 Meta Info" };

export default function AccountPage() {
  return (
    <main className="lx flex-1 px-4 pt-6 pb-8 sm:px-6">
      <Suspense fallback={<AccountSkeleton />}>
        <AccountView />
      </Suspense>
    </main>
  );
}
