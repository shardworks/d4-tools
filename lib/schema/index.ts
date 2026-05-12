// Canonical v2+ schema layer — single source of truth for both
// persistence-load validation and form validation (D2).

export { AffixInstanceSchema } from "./affix";
export type { AffixInstance } from "./affix";

export { AspectInstanceSchema } from "./aspect";
export type { AspectInstance } from "./aspect";

export {
  ItemSchema,
  ItemRaritySchema,
  ITEM_RARITIES,
} from "./item";
export type { Item, ItemRarity } from "./item";

export { SkillSelectionSchema, SkillSelectionsSchema } from "./skill";
export type { SkillSelection } from "./skill";

export {
  ParagonGlyphSchema,
  ParagonBoardAllocationSchema,
  ParagonAllocationSchema,
} from "./paragon";
export type {
  ParagonGlyph,
  ParagonBoardAllocation,
  ParagonAllocation,
} from "./paragon";

export {
  PlaystyleConstraintSchema,
  PLAYSTYLE_CATEGORIES,
} from "./playstyle";
export type { PlaystyleConstraint } from "./playstyle";

export {
  CharacterSchema,
  CharacterFormSchema,
  D4ClassSchema,
  D4_CLASSES,
} from "./character";
export type { Character, CharacterFormInput, CharacterFormOutput, D4Class } from "./character";

export { BuildSchema, BuildImportedFromSchema } from "./build";
export type { Build, BuildImportedFrom } from "./build";
