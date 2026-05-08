"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { BuildSchema, CharacterSchema } from "@/lib/schema";
import type { Build, Character } from "@/lib/schema";
import {
  Sword,
  User,
  Plus,
  Upload,
  Download,
  CloudDownload,
} from "lucide-react";

interface CommandEntry {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  group: string;
  run: () => void | Promise<void>;
}

/**
 * Functional command palette dispatching the brief's six commands (D27):
 *   1. navigate-to-character
 *   2. navigate-to-build
 *   3. create-new-character
 *   4. create-new-build
 *   5. import-build
 *   6. export-build
 *
 * Export/import round-trips the persisted build+character shape (D28).
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [builds, setBuilds] = useState<Build[]>([]);
  const [mode, setMode] = useState<"root" | "nav-char" | "nav-build">("root");
  const router = useRouter();

  // Open/close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      if (modifier && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Load characters + builds when palette opens
  useEffect(() => {
    if (!open) return;
    Promise.all([
      fetch("/api/characters").then((r) => r.json()).catch(() => []),
      fetch("/api/builds").then((r) => r.json()).catch(() => []),
    ]).then(([chars, blds]) => {
      setCharacters(Array.isArray(chars) ? chars : []);
      setBuilds(Array.isArray(blds) ? blds : []);
    });
  }, [open]);

  // Reset mode on close
  const handleOpenChange = useCallback((v: boolean) => {
    setOpen(v);
    if (!v) setMode("root");
  }, []);

  // Create a temporary file input programmatically (avoids useRef tracking by React compiler)
  const triggerFileInput = useCallback((onFile: (f: File) => void) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) onFile(file);
    };
    input.click();
  }, []);

  // Export build: downloads JSON file containing build + character
  async function exportBuild(buildId: string) {
    const buildRes = await fetch(`/api/builds/${buildId}`).then((r) => r.json());
    const build = buildRes as Build;
    const char = characters.find((c) => c.id === build.characterId);
    const exportPayload = { build, character: char ?? null };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${build.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    handleOpenChange(false);
  }

  // Import build: reads a file, validates, and writes via API
  const importBuildFromFile = useCallback(async (file: File) => {
    const text = await file.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      alert("Import failed: invalid JSON");
      return;
    }

    // Validate the envelope
    if (typeof data !== "object" || data === null || !("build" in data)) {
      alert("Import failed: not a valid build file (expected { build, character? })");
      return;
    }

    const payload = data as { build: unknown; character?: unknown };

    // Validate build schema
    const buildParsed = BuildSchema.safeParse(payload.build);
    if (!buildParsed.success) {
      alert(`Import failed — build schema error:\n${buildParsed.error.toString()}`);
      return;
    }

    // Import character if present
    if (payload.character) {
      const charParsed = CharacterSchema.safeParse(payload.character);
      if (!charParsed.success) {
        alert(`Import failed — character schema error:\n${charParsed.error.toString()}`);
        return;
      }
      const charRes = await fetch(`/api/characters/${charParsed.data.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(charParsed.data),
      });
      if (!charRes.ok) {
        // Create instead
        await fetch("/api/characters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(charParsed.data),
        });
      }
    }

    // Import build
    const buildRes = await fetch(`/api/builds/${buildParsed.data.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildParsed.data),
    });
    if (!buildRes.ok) {
      await fetch("/api/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildParsed.data),
      });
    }

    handleOpenChange(false);
    router.push(`/builds/${buildParsed.data.id}`);
    router.refresh();
  }, [handleOpenChange, router]);

  // Root commands — useMemo so closures are stable and ref not accessed during render
  const rootCommands = useMemo<CommandEntry[]>(() => [
    {
      id: "navigate-to-character",
      label: "Go to Character…",
      description: "Navigate to a character editor",
      icon: User,
      group: "Navigate",
      run: () => setMode("nav-char"),
    },
    {
      id: "navigate-to-build",
      label: "Go to Build…",
      description: "Navigate to a build detail",
      icon: Sword,
      group: "Navigate",
      run: () => setMode("nav-build"),
    },
    {
      id: "create-new-character",
      label: "Create New Character",
      description: "Open the new character form",
      icon: Plus,
      group: "Create",
      run: () => {
        handleOpenChange(false);
        router.push("/characters/new");
      },
    },
    {
      id: "create-new-build",
      label: "Create New Build (via New Character)",
      description: "A new build is auto-created with each character",
      icon: Plus,
      group: "Create",
      run: () => {
        handleOpenChange(false);
        router.push("/characters/new");
      },
    },
    {
      id: "import-build",
      label: "Import Build…",
      description: "Load a build from a JSON file",
      icon: Upload,
      group: "File",
      run: () => triggerFileInput(importBuildFromFile),
    },
    {
      id: "export-build",
      label: "Export Build…",
      description: "Download a build as a JSON file",
      icon: Download,
      group: "File",
      run: () => setMode("nav-build"),
    },
    {
      id: "import-from-battlenet",
      label: "Import character from Battle.net",
      description: "Sign in with Battle.net and import your D4 hero",
      icon: CloudDownload,
      group: "Create",
      run: () => {
        handleOpenChange(false);
        router.push("/import");
      },
    },
  ], [triggerFileInput, handleOpenChange, router, importBuildFromFile]);

  // Build a grouped command list (stable unless rootCommands changes)
  const groupedCommands = useMemo(
    () =>
      rootCommands.reduce<Record<string, CommandEntry[]>>((acc, cmd) => {
        (acc[cmd.group] ??= []).push(cmd);
        return acc;
      }, {}),
    [rootCommands]
  );

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="overflow-hidden p-0 shadow-lg max-w-[32rem]"
        >
          <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
            {mode === "root" && (
              <>
                <CommandInput placeholder="Type a command or search…" />
                <CommandList>
                  <CommandEmpty>No commands found.</CommandEmpty>
                  {Object.entries(groupedCommands).map(([group, cmds]) => (
                    <CommandGroup key={group} heading={group}>
                      {cmds.map((cmd) => {
                        const Icon = cmd.icon;
                        return (
                          <CommandItem
                            key={cmd.id}
                            value={cmd.label}
                            onSelect={async () => {
                              await cmd.run();
                            }}
                          >
                            <Icon size={16} className="mr-2 shrink-0" />
                            <div>
                              <div className="text-sm">{cmd.label}</div>
                              {cmd.description && (
                                <div className="text-[11px] text-stone-500">
                                  {cmd.description}
                                </div>
                              )}
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  ))}
                </CommandList>
              </>
            )}

            {mode === "nav-char" && (
              <>
                <CommandInput
                  placeholder="Search characters…"
                  autoFocus
                />
                <CommandList>
                  <CommandEmpty>No characters found.</CommandEmpty>
                  <CommandGroup heading="Characters">
                    {characters.map((char) => (
                      <CommandItem
                        key={char.id}
                        value={char.name}
                        onSelect={() => {
                          handleOpenChange(false);
                          router.push(`/characters/${char.id}`);
                        }}
                      >
                        <User size={16} className="mr-2 shrink-0" />
                        <div>
                          <div className="text-sm">{char.name}</div>
                          <div className="text-[11px] text-stone-500">
                            {char.class} · Lvl {char.level}
                          </div>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </>
            )}

            {mode === "nav-build" && (
              <>
                <CommandInput
                  placeholder="Search builds…"
                  autoFocus
                />
                <CommandList>
                  <CommandEmpty>No builds found.</CommandEmpty>
                  <CommandGroup heading="Builds">
                    {builds.map((build) => {
                      const char = characters.find((c) => c.id === build.characterId);
                      return (
                        <CommandItem
                          key={build.id}
                          value={build.name + " " + (char?.name ?? "")}
                          onSelect={() => {
                            // nav-build mode is used by "Export Build…" command —
                            // selecting a build in this mode triggers the export
                            exportBuild(build.id);
                          }}
                        >
                          <Sword size={16} className="mr-2 shrink-0" />
                          <div>
                            <div className="text-sm">{build.name}</div>
                            {char && (
                              <div className="text-[11px] text-stone-500">
                                {char.name} · {char.class}
                              </div>
                            )}
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </>
            )}
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
