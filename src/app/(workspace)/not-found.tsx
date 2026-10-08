import Link from "next/link";
import { FileQuestionMarkIcon, LayoutDashboardIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Rendered inside the workspace shell whenever a page calls notFound(). */
export default function WorkspaceNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center sm:py-24">
      <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-gold-soft text-gold-foreground">
        <FileQuestionMarkIcon className="size-7" />
      </div>
      <p className="text-xs font-semibold tracking-widest text-gold-foreground uppercase">Not found</p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight text-balance sm:text-2xl">We couldn&apos;t find that page or record</h1>
      <p className="mt-3 text-sm text-pretty text-muted-foreground">
        It may have been deleted or moved, or it may be in an area of the workspace you don&apos;t have access to. If someone shared this link
        with you, ask them to check your access.
      </p>
      <div className="mt-7 flex flex-col gap-2 sm:flex-row">
        <Button asChild>
          <Link href="/dashboard">
            <LayoutDashboardIcon /> Back to dashboard
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/search">
            <SearchIcon /> Search the workspace
          </Link>
        </Button>
      </div>
    </div>
  );
}
