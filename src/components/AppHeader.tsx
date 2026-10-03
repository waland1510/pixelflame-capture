import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  addProfile,
  deleteProfile,
  ensureProfile,
  getActiveProfile,
  getProfiles,
  practiceStats,
  renameProfile,
  setActiveProfile,
  useStoreVersion,
} from "@/lib/store";

type NameDialog = { mode: "add" | "rename"; name: string } | null;

export function AppHeader() {
  const version = useStoreVersion();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<NameDialog>(null);

  useEffect(() => {
    if (version) ensureProfile();
  }, [version]);

  const profiles = version ? getProfiles() : [];
  const active = version ? getActiveProfile() : undefined;
  const streak = active ? practiceStats(active.id).streak : 0;

  const switchTo = (id: string) => {
    if (id === active?.id) return;
    setActiveProfile(id);
    navigate({ to: "/" });
  };

  const submit = () => {
    if (!dialog || !dialog.name.trim()) return;
    if (dialog.mode === "add") {
      addProfile(dialog.name);
      navigate({ to: "/" });
    } else if (active) renameProfile(active.id, dialog.name);
    setDialog(null);
  };

  return (
    <header className="border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <nav className="flex items-center gap-5 text-sm">
          <Link to="/" className="font-display text-lg text-foreground">
            Lernwerk
          </Link>
          <Link to="/" hash="new" className="text-muted-foreground hover:text-foreground">
            New lesson
          </Link>
        </nav>
        {active && (
          <div className="flex items-center gap-2">
            {streak > 0 && (
              <span
                className="rounded-full bg-accent/10 px-2.5 py-1 text-xs text-accent"
                title={`${streak}-day practice streak`}
              >
                🔥 {streak}
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs text-accent-foreground">
                    {active.name.slice(0, 1).toUpperCase()}
                  </span>
                  {active.name}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Learner</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={active.id} onValueChange={switchTo}>
                  {profiles.map((p) => (
                    <DropdownMenuRadioItem key={p.id} value={p.id}>
                      {p.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setDialog({ mode: "add", name: "" })}>
                  Add learner…
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDialog({ mode: "rename", name: active.name })}>
                  Rename {active.name}…
                </DropdownMenuItem>
                {profiles.length > 1 && (
                  <DropdownMenuItem
                    className="text-destructive"
                    onSelect={() => {
                      if (confirm(`Delete ${active.name} and all of their progress?`)) {
                        deleteProfile(active.id);
                        navigate({ to: "/" });
                      }
                    }}
                  >
                    Delete {active.name}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <Dialog open={!!dialog} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "add" ? "Add a learner" : "Rename learner"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Input
              autoFocus
              value={dialog?.name ?? ""}
              onChange={(e) => dialog && setDialog({ ...dialog, name: e.target.value })}
              placeholder="Name"
            />
            <DialogFooter className="mt-4">
              <Button type="submit" disabled={!dialog?.name.trim()}>
                {dialog?.mode === "add" ? "Add" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </header>
  );
}
