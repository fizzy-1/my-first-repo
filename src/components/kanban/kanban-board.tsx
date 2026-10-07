"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangleIcon, ArrowRightLeftIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import type { ActionState } from "@/server/action";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface KanbanColumn<S extends string = string> {
  id: S;
  label: string;
  /** Optional aggregate shown under the column title (e.g. "R420k"). */
  summary?: string;
  tone?: BadgeTone;
}

export interface KanbanCard<S extends string = string> {
  id: string;
  columnId: S;
  title: string;
  href?: string;
  lines?: string[];
  badges?: { label: string; tone: BadgeTone }[];
  footerLeft?: string;
  footerRight?: string;
  urgent?: string;
}

/**
 * Pipeline board. Cards can be dragged between columns (mouse) or moved via
 * the "Move to" menu (keyboard / touch). Moves call a Server Action and are
 * applied optimistically; the server remains the source of truth.
 */
export function KanbanBoard<S extends string>({
  columns,
  cards,
  moveAction,
  canMove,
  emptyText = "Nothing here",
}: {
  columns: KanbanColumn<S>[];
  cards: KanbanCard<S>[];
  moveAction: (input: { id: string; status: S }) => Promise<ActionState>;
  canMove: boolean;
  emptyText?: string;
}) {
  const [optimistic, setOptimistic] = React.useOptimistic(cards, (state, move: { id: string; columnId: S }) =>
    state.map((c) => (c.id === move.id ? { ...c, columnId: move.columnId } : c)),
  );
  const [pending, startTransition] = React.useTransition();
  const [dragOver, setDragOver] = React.useState<string | null>(null);
  const [movingId, setMovingId] = React.useState<string | null>(null);

  const move = (id: string, columnId: S) => {
    const card = optimistic.find((c) => c.id === id);
    if (!card || card.columnId === columnId) return;
    setMovingId(id);
    startTransition(async () => {
      setOptimistic({ id, columnId });
      const result = await moveAction({ id, status: columnId });
      if (!result?.ok) toast.error(result?.message ?? "Could not move the card");
      else if (result.message) toast.success(result.message);
      setMovingId(null);
    });
  };

  return (
    <div className="scrollbar-none -mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-3">
        {columns.map((col) => {
          const colCards = optimistic.filter((c) => c.columnId === col.id);
          return (
            <section
              key={col.id}
              aria-label={col.label}
              onDragOver={(e) => {
                if (!canMove) return;
                e.preventDefault();
                setDragOver(col.id);
              }}
              onDragLeave={() => setDragOver((d) => (d === col.id ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData("text/plain");
                if (id) move(id, col.id);
              }}
              className={cn(
                "flex w-72 shrink-0 flex-col rounded-xl border border-border bg-muted/40 transition-colors",
                dragOver === col.id && "border-primary/60 bg-primary-soft/40",
              )}
            >
              <header className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-[13px] font-semibold">{col.label}</h3>
                  <span className="tabular rounded-full bg-card px-1.5 text-[11px] leading-5 text-muted-foreground">{colCards.length}</span>
                </div>
                {col.summary && <span className="tabular text-[11px] text-muted-foreground">{col.summary}</span>}
              </header>
              <ul className="flex max-h-[calc(100dvh-280px)] min-h-24 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {colCards.length === 0 && <li className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">{emptyText}</li>}
                {colCards.map((card) => (
                  <li
                    key={card.id}
                    draggable={canMove}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", card.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className={cn(
                      "group rounded-lg border border-border bg-card p-3 shadow-xs transition-shadow hover:shadow-md",
                      canMove && "cursor-grab active:cursor-grabbing",
                      movingId === card.id && pending && "opacity-60",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        {card.href ? (
                          <Link href={card.href} className="line-clamp-2 text-[13px] leading-snug font-medium hover:underline">
                            {card.title}
                          </Link>
                        ) : (
                          <p className="line-clamp-2 text-[13px] leading-snug font-medium">{card.title}</p>
                        )}
                        {card.lines?.map((line) => (
                          <p key={line} className="mt-0.5 truncate text-xs text-muted-foreground">
                            {line}
                          </p>
                        ))}
                      </div>
                      {canMove && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className="rounded p-1 text-muted-foreground opacity-60 hover:bg-accent hover:opacity-100 focus-visible:opacity-100"
                            aria-label={`Move ${card.title}`}
                          >
                            {movingId === card.id && pending ? <Loader2Icon className="size-3.5 animate-spin" /> : <ArrowRightLeftIcon className="size-3.5" />}
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Move to</DropdownMenuLabel>
                            {columns
                              .filter((c) => c.id !== card.columnId)
                              .map((c) => (
                                <DropdownMenuItem key={c.id} onSelect={() => move(card.id, c.id)}>
                                  {c.label}
                                </DropdownMenuItem>
                              ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    {(card.badges?.length || card.urgent) && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {card.urgent && (
                          <Badge tone="danger">
                            <AlertTriangleIcon /> {card.urgent}
                          </Badge>
                        )}
                        {card.badges?.map((b) => (
                          <Badge key={b.label} tone={b.tone}>
                            {b.label}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {(card.footerLeft || card.footerRight) && (
                      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
                        <span className="truncate">{card.footerLeft}</span>
                        <span className="tabular shrink-0 font-medium text-foreground">{card.footerRight}</span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
