"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, FormProvider, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CharacterSchema, type Character, type D4Class } from "@/lib/schema";
import { classes } from "@/lib/catalog";
import { SkillTreePicker } from "./SkillTreePicker";
import { ParagonAllocator } from "./ParagonAllocator";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Save, AlertCircle } from "lucide-react";

interface CharacterEditorProps {
  /** Existing character to edit; undefined = new character mode */
  character?: Character;
  /** If true, character is newly created and we auto-create a default build on save */
  isNew?: boolean;
}

export function CharacterEditor({ character, isNew = false }: CharacterEditorProps) {
  const router = useRouter();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"basic" | "skills" | "paragon">("basic");

  // Use three-generic form to separate RHF input type (with optionals) from
  // Zod output type (with applied defaults) — @hookform/resolvers/zod v5 + Zod v4 pattern.
  type CharacterInput = z.input<typeof CharacterSchema>;
  const form = useForm<CharacterInput, unknown, Character>({
    resolver: zodResolver(CharacterSchema) as unknown as Resolver<CharacterInput, unknown, Character>,
    defaultValues: character ?? {
      id: "",
      name: "",
      class: "Sorcerer",
      level: 1,
      paragonAllocation: { paragonLevel: 0, boards: [] },
      skillSelections: [],
      equippedItems: {},
      playstyleConstraints: [],
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = form;

  const selectedClass = watch("class") as D4Class;
  const level = watch("level") ?? 1;
  const prevClassRef = useRef<string>(selectedClass);

  // When class changes, reset skill selections
  useEffect(() => {
    if (prevClassRef.current !== selectedClass) {
      setValue("skillSelections", []);
      prevClassRef.current = selectedClass;
    }
  }, [selectedClass, setValue]);

  // Warn user when navigating away with unsaved changes (D18)
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  async function onSubmit(data: Character) {
    setIsSaving(true);
    setSaveError(null);
    try {
      if (isNew) {
        // Create character
        const charRes = await fetch("/api/characters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!charRes.ok) {
          const err = await charRes.json();
          throw new Error(err.error ?? "Failed to create character");
        }
        const savedChar: Character = await charRes.json();

        // Auto-create a default build named after the character (D26)
        const buildRes = await fetch("/api/builds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterId: savedChar.id,
            name: savedChar.name,
            notes: "",
            targetItems: {},
          }),
        });
        if (!buildRes.ok) {
          const err = await buildRes.json();
          throw new Error(err.error ?? "Failed to create default build");
        }
        const savedBuild = await buildRes.json();

        // Navigate to the new build's detail page
        router.push(`/builds/${savedBuild.id}`);
      } else {
        // Update existing character
        const res = await fetch(`/api/characters/${data.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? "Failed to save character");
        }
        // Reset dirty state
        form.reset(data);
        router.refresh();
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsSaving(false);
    }
  }

  const tabStyle = (tab: typeof activeTab) => ({
    padding: "6px 14px",
    fontSize: "13px",
    fontWeight: activeTab === tab ? 600 : 400,
    color: activeTab === tab ? "var(--accent)" : "var(--stone-400)",
    borderBottom: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
    background: "none",
    border: "none",
    borderBottomWidth: "2px",
    borderBottomStyle: "solid" as const,
    borderBottomColor: activeTab === tab ? "var(--accent)" : "transparent",
    cursor: "pointer",
    transition: "color 100ms",
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1
            style={{
              fontSize: "20px",
              fontWeight: 700,
              color: "var(--stone-100)",
              margin: 0,
            }}
          >
            {isNew ? "New Character" : "Edit Character"}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {isDirty && (
              <Badge variant="outline" style={{ fontSize: "11px", color: "var(--stone-400)" }}>
                Unsaved changes
              </Badge>
            )}
            <Button type="submit" disabled={isSaving} style={{ gap: "6px" }}>
              <Save size={14} />
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        {/* Save error */}
        {saveError && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 14px",
              background: "rgba(239,68,68,0.1)",
              borderRadius: "6px",
              border: "1px solid rgba(239,68,68,0.3)",
              color: "#ef4444",
              fontSize: "13px",
            }}
          >
            <AlertCircle size={14} />
            {saveError}
          </div>
        )}

        {/* Tab bar */}
        <div
          style={{
            display: "flex",
            gap: 0,
            borderBottom: "1px solid var(--stone-800)",
          }}
        >
          <button type="button" style={tabStyle("basic")} onClick={() => setActiveTab("basic")}>
            Basic Info
          </button>
          <button type="button" style={tabStyle("skills")} onClick={() => setActiveTab("skills")}>
            Skills
          </button>
          <button type="button" style={tabStyle("paragon")} onClick={() => setActiveTab("paragon")}>
            Paragon
          </button>
        </div>

        {/* Tab content */}
        {activeTab === "basic" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Name */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label
                htmlFor="char-name"
                style={{ fontSize: "13px", fontWeight: 500, color: "var(--stone-300)" }}
              >
                Character Name *
              </label>
              <Input
                id="char-name"
                placeholder="e.g. Doomed Aura Sorcerer"
                {...register("name")}
                style={{ maxWidth: "380px" }}
              />
              {errors.name && (
                <p style={{ color: "var(--destructive, #ef4444)", fontSize: "12px", margin: 0 }}>
                  {errors.name.message}
                </p>
              )}
            </div>

            {/* Class */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: 500, color: "var(--stone-300)" }}>
                Class *
              </label>
              <Select
                value={selectedClass}
                onValueChange={(val) => setValue("class", val as D4Class, { shouldDirty: true })}
              >
                <SelectTrigger style={{ maxWidth: "240px" }}>
                  <SelectValue placeholder="Select class…" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((cls) => (
                    <SelectItem
                      key={cls.id}
                      value={cls.id}
                      disabled={!cls.supported}
                    >
                      {cls.label}
                      {!cls.supported && (
                        <span style={{ color: "var(--stone-600)", marginLeft: "8px", fontSize: "11px" }}>
                          — catalog not yet verified
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.class && (
                <p style={{ color: "var(--destructive, #ef4444)", fontSize: "12px", margin: 0 }}>
                  {errors.class.message}
                </p>
              )}
            </div>

            <div style={{ display: "flex", gap: "24px" }}>
              {/* Level */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label
                  htmlFor="char-level"
                  style={{ fontSize: "13px", fontWeight: 500, color: "var(--stone-300)" }}
                >
                  Character Level
                </label>
                <Input
                  id="char-level"
                  type="number"
                  min={1}
                  max={100}
                  {...register("level", { valueAsNumber: true })}
                  style={{ width: "100px" }}
                />
                {errors.level && (
                  <p style={{ color: "var(--destructive, #ef4444)", fontSize: "12px", margin: 0 }}>
                    {errors.level.message}
                  </p>
                )}
              </div>
            </div>

            {!isNew && (
              <div style={{ fontSize: "12px", color: "var(--stone-600)" }}>
                ID: <code>{character?.id}</code>
              </div>
            )}
          </div>
        )}

        {activeTab === "skills" && (
          <SkillTreePicker className={selectedClass} level={level} />
        )}

        {activeTab === "paragon" && (
          <ParagonAllocator className={selectedClass} />
        )}
      </form>
    </FormProvider>
  );
}
