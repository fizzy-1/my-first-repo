import { notFound } from "next/navigation";

/** Unknown URLs inside the workspace show the in-shell not-found page instead of the bare root one. */
export default function MissingPage() {
  notFound();
}
