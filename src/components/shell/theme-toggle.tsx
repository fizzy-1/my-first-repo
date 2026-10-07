"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  return (
    <Tooltip content={isDark ? "Switch to light mode" : "Switch to dark mode"}>
      <Button variant="ghost" size="icon" onClick={() => setTheme(isDark ? "light" : "dark")} aria-label="Toggle theme">
        <SunIcon className="hidden dark:block" />
        <MoonIcon className="block dark:hidden" />
      </Button>
    </Tooltip>
  );
}
