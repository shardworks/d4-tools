"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Character, Build, Item } from "@/lib/schema";
import { BuildSummaryView } from "@/components/d4/BuildSummaryView";
import { Button } from "@/components/ui/button";
import { ArrowLeft, PenSquare } from "lucide-react";

interface BuildDetailClientProps {
  build: Build;
  character: Character;
}

/**
 * Client component wrapping BuildSummaryView.
 * Handles optimistic character updates when gear slot items are saved/removed.
 */
export function BuildDetailClient({ build, character: initialCharacter }: BuildDetailClientProps) {
  const router = useRouter();
  const [character, setCharacter] = useState<Character>(initialCharacter);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleItemSave = useCallback(
    async (slotId: string, item: Item) => {
      // Optimistic update
      const updated: Character = {
        ...character,
        equippedItems: { ...character.equippedItems, [slotId]: item },
        updatedAt: new Date().toISOString(),
      };
      setCharacter(updated);

      // Persist
      const res = await fetch(`/api/characters/${character.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });

      if (!res.ok) {
        // Rollback
        setCharacter(character);
        const err = await res.json();
        setSaveError(err.error ?? "Failed to save item");
        throw new Error(err.error ?? "Failed to save item");
      }

      setSaveError(null);
      router.refresh();
    },
    [character, router]
  );

  const handleItemRemove = useCallback(
    async (slotId: string) => {
      // Optimistic update
      const equippedItems = { ...character.equippedItems };
      delete equippedItems[slotId];
      const updated: Character = {
        ...character,
        equippedItems,
        updatedAt: new Date().toISOString(),
      };
      setCharacter(updated);

      // Persist
      const res = await fetch(`/api/characters/${character.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });

      if (!res.ok) {
        // Rollback
        setCharacter(character);
        const err = await res.json();
        setSaveError(err.error ?? "Failed to remove item");
        throw new Error(err.error ?? "Failed to remove item");
      }

      setSaveError(null);
      router.refresh();
    },
    [character, router]
  );

  return (
    <div className="p-6">
      {/* Navigation */}
      <div className="flex items-center gap-3 mb-5">
        <Link href="/builds" className="no-underline">
          <Button variant="ghost" size="sm" className="gap-[6px]">
            <ArrowLeft size={14} />
            All Builds
          </Button>
        </Link>
        <Link href={`/characters/${character.id}`} className="no-underline">
          <Button variant="outline" size="sm" className="gap-[6px]">
            <PenSquare size={14} />
            Edit Character
          </Button>
        </Link>
      </div>

      {/* Save error */}
      {saveError && (
        <div className="error-banner mb-4">
          {saveError}
        </div>
      )}

      <BuildSummaryView
        character={character}
        build={build}
        editable
        onItemSave={handleItemSave}
        onItemRemove={handleItemRemove}
      />
    </div>
  );
}
