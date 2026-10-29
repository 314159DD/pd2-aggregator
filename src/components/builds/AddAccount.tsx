"use client";

import { useId, useState } from "react";
import { Button } from "@/components/lx/Button";
import { SearchField } from "@/components/lx/SearchField";
import { queueAccount } from "@/lib/builds/api";

const VALID = /^[a-zA-Z0-9_-]{1,50}$/;
const INVALID_TEXT = "Account names use letters, numbers, _ and - only.";

type Notice = { text: string; tone: "ok" | "bad" } | null;

export function AddAccount({ initial = "" }: { initial?: string }) {
  const id = useId();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = value.trim();
    if (!VALID.test(name)) {
      setNotice({ text: INVALID_TEXT, tone: "bad" });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const r = await queueAccount(name);
      setNotice(
        r === "queued"
          ? { text: "Queued. Characters appear within a few minutes.", tone: "ok" }
          : r === "rate-limited"
            ? { text: "Too many requests, try again later.", tone: "bad" }
            : { text: INVALID_TEXT, tone: "bad" },
      );
    } catch {
      setNotice({ text: "Could not queue the account.", tone: "bad" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1.5">
          <label htmlFor={id} className="text-xs font-medium text-ink-soft">
            Account name
          </label>
          <SearchField
            id={id}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            maxLength={50}
          />
        </div>
        <Button type="submit" variant="primary" disabled={busy}>
          Track account
        </Button>
      </div>
      <p role="status" className={`min-h-4 text-xs ${notice?.tone === "bad" ? "text-danger" : "text-ink-soft"}`}>
        {notice?.text}
      </p>
    </form>
  );
}
