"use client";

import { useState } from "react";
import { Wrench } from "lucide-react";
import { BugReportModal } from "@/components/ui/bug-report-modal";
import type { WorkspaceArea } from "./workspace-shell";

export function WorkspaceSupportChrome({
  workspaceArea,
  user,
}: {
  workspaceArea: WorkspaceArea;
  user?: { id: string; email?: string; user_metadata?: { name?: string; full_name?: string } } | null;
}) {
  const [bugOpen, setBugOpen] = useState(false);
  const inboxTop = workspaceArea === "inbox";

  return (
    <>
      <button
        type="button"
        onClick={() => setBugOpen(true)}
        title="Нашли дефект?"
        className={`fixed z-[45] flex items-center justify-center rounded-lg border border-[#c9c1b6]/90 bg-[#F7F4ED]/95 p-2.5 text-[#5f5a52] shadow-md transition hover:bg-white hover:text-[#0a0a0a] ${
          inboxTop ? "right-5 top-5 sm:right-6 sm:top-6" : "bottom-6 right-6"
        }`}
      >
        <Wrench className="h-4 w-4" strokeWidth={2.2} />
      </button>
      <BugReportModal isOpen={bugOpen} onClose={() => setBugOpen(false)} user={user ?? null} />
    </>
  );
}
