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
import { cn } from "@/lib/utils";

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

  const tabClass = (tab: typeof activeTab) =>
    cn(
      "px-[14px] py-[6px] text-sm cursor-pointer bg-transparent border-0 border-b-2 border-b-transparent transition-colors duration-100",
      activeTab === tab
        ? "font-semibold text-accent border-b-accent"
        : "font-normal text-stone-400"
    );

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-[20px] font-bold text-stone-100 m-0">
            {isNew ? "New Character" : "Edit Character"}
          </h1>
          <div className="flex items-center gap-[10px]">
            {isDirty && (
              <Badge variant="outline" className="text-[11px] text-stone-400">
                Unsaved changes
              </Badge>
            )}
            <Button type="submit" disabled={isSaving} className="gap-[6px]">
              <Save size={14} />
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        {/* Save error */}
        {saveError && (
          <div className="error-banner">
            <AlertCircle size={14} />
            {saveError}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex border-b border-stone-800">
          <button type="button" className={tabClass("basic")} onClick={() => setActiveTab("basic")}>
            Basic Info
          </button>
          <button type="button" className={tabClass("skills")} onClick={() => setActiveTab("skills")}>
            Skills
          </button>
          <button type="button" className={tabClass("paragon")} onClick={() => setActiveTab("paragon")}>
            Paragon
          </button>
        </div>

        {/* Tab content */}
        {activeTab === "basic" && (
          <div className="flex flex-col gap-4">
            {/* Name */}
            <div className="flex flex-col gap-[6px]">
              <label
                htmlFor="char-name"
                className="text-sm font-medium text-stone-300"
              >
                Character Name *
              </label>
              <Input
                id="char-name"
                placeholder="e.g. Doomed Aura Sorcerer"
                {...register("name")}
                className="max-w-[380px]"
              />
              {errors.name && (
                <p className="error-text text-xs m-0">
                  {errors.name.message}
                </p>
              )}
            </div>

            {/* Class */}
            <div className="flex flex-col gap-[6px]">
              <label className="text-sm font-medium text-stone-300">
                Class *
              </label>
              <Select
                value={selectedClass}
                onValueChange={(val) => setValue("class", val as D4Class, { shouldDirty: true })}
              >
                <SelectTrigger className="max-w-[240px]">
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
                        <span className="text-stone-600 ml-2 text-[11px]">
                          — catalog not yet verified
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.class && (
                <p className="error-text text-xs m-0">
                  {errors.class.message}
                </p>
              )}
            </div>

            <div className="flex gap-6">
              {/* Level */}
              <div className="flex flex-col gap-[6px]">
                <label
                  htmlFor="char-level"
                  className="text-sm font-medium text-stone-300"
                >
                  Character Level
                </label>
                <Input
                  id="char-level"
                  type="number"
                  min={1}
                  max={100}
                  {...register("level", { valueAsNumber: true })}
                  className="w-[100px]"
                />
                {errors.level && (
                  <p className="error-text text-xs m-0">
                    {errors.level.message}
                  </p>
                )}
              </div>
            </div>

            {!isNew && (
              <div className="text-xs text-stone-600">
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
