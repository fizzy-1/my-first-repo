"use client";

import { AlertTriangleIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <AlertTriangleIcon className="size-6" />
      </div>
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This section couldn&apos;t be loaded. The error has been logged. Try again, or return to the dashboard.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>}
      <Button className="mt-6" onClick={reset}>
        <RotateCcwIcon /> Try again
      </Button>
    </div>
  );
}
