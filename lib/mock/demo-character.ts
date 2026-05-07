type Affix = {
  label: string;
  value: string;
};

type Item = {
  id: string;
  slot: string;
  name: string;
  rarity: "common" | "magic" | "rare" | "legendary" | "unique" | "mythic";
  itemPower?: number;
  affixes: Affix[];
  aspectName?: string;
  isAncestral?: boolean;
};

type Character = {
  name: string;
  class: string;
  level: number;
  paragon: number;
  buildName: string;
  items: Item[];
  stats: Array<{ label: string; value: string }>;
};

export const demoCharacter: Character = {
  name: "Doomed Aura Sorcerer",
  class: "Sorcerer",
  level: 100,
  paragon: 200,
  buildName: "Blizzard / Ice Shards",
  items: [
    {
      id: "item-helm-1",
      slot: "helm",
      name: "Harlequin Crest",
      rarity: "unique",
      itemPower: 925,
      affixes: [
        { label: "Maximum Life", value: "+2800" },
        { label: "Cooldown Reduction", value: "+10.5%" },
        { label: "Resource Cost Reduction", value: "+10%" },
        { label: "Ranks to All Skills", value: "+4" },
      ],
    },
    {
      id: "item-chest-1",
      slot: "chest",
      name: "Frostweave Vestment",
      rarity: "legendary",
      itemPower: 918,
      affixes: [
        { label: "Maximum Life", value: "+1640" },
        { label: "Damage Reduction", value: "+12.5%" },
        { label: "Intelligence", value: "+180" },
        { label: "Ranks to Blizzard", value: "+3" },
      ],
      aspectName: "Aspect of Frozen Orbit",
      isAncestral: true,
    },
    {
      id: "item-gloves-1",
      slot: "gloves",
      name: "Glacial Grips",
      rarity: "rare",
      itemPower: 912,
      affixes: [
        { label: "Attack Speed", value: "+8%" },
        { label: "Critical Strike Chance", value: "+5%" },
        { label: "Intelligence", value: "+140" },
        { label: "Ranks to Ice Shards", value: "+2" },
      ],
    },
    {
      id: "item-pants-1",
      slot: "pants",
      name: "Shimmering Breeches",
      rarity: "legendary",
      itemPower: 920,
      affixes: [
        { label: "Maximum Life", value: "+1580" },
        { label: "Damage Reduction from Close Enemies", value: "+14%" },
        { label: "Dodge Chance", value: "+7%" },
        { label: "Ranks to Teleport", value: "+2" },
      ],
      aspectName: "Conceited Aspect",
    },
    {
      id: "item-boots-1",
      slot: "boots",
      name: "Windstep Treads",
      rarity: "rare",
      itemPower: 908,
      affixes: [
        { label: "Movement Speed", value: "+18%" },
        { label: "Evade Grants Movement Speed", value: "+25%" },
        { label: "Intelligence", value: "+120" },
        { label: "Mana on Kill", value: "+4" },
      ],
    },
    {
      id: "item-mainhand-1",
      slot: "mainHand",
      name: "Flamescar",
      rarity: "unique",
      itemPower: 925,
      affixes: [
        { label: "Core Skill Damage", value: "+35%" },
        { label: "Critical Strike Damage", value: "+55%" },
        { label: "Intelligence", value: "+220" },
        { label: "Lucky Hit: Up to 10% chance to restore 20 Mana", value: "10%" },
      ],
    },
    {
      id: "item-offhand-1",
      slot: "offHand",
      name: "Frostbitten Focus",
      rarity: "legendary",
      itemPower: 915,
      affixes: [
        { label: "Mana per Second", value: "+7.5" },
        { label: "Intelligence", value: "+190" },
        { label: "Skill Cooldown Reduction", value: "+8%" },
        { label: "Ranks to Frost Nova", value: "+3" },
      ],
      aspectName: "Prodigy's Aspect",
    },
    {
      id: "item-amulet-1",
      slot: "amulet",
      name: "Icebound Pendant",
      rarity: "legendary",
      itemPower: 922,
      affixes: [
        { label: "Resistances to All Elements", value: "+22%" },
        { label: "Movement Speed", value: "+12%" },
        { label: "Intelligence", value: "+160" },
        { label: "Cooldown Reduction", value: "+8%" },
      ],
      aspectName: "Snowguard's Aspect",
      isAncestral: true,
    },
    {
      id: "item-ring1-1",
      slot: "ring1",
      name: "Permafrost Band",
      rarity: "legendary",
      itemPower: 919,
      affixes: [
        { label: "Critical Strike Chance", value: "+6.5%" },
        { label: "Critical Strike Damage with Cold Skills", value: "+40%" },
        { label: "Maximum Life", value: "+1200" },
        { label: "Cold Damage", value: "+18%" },
      ],
      aspectName: "Aspect of Piercing Cold",
    },
    {
      id: "item-ring2-1",
      slot: "ring2",
      name: "Glacial Signet",
      rarity: "rare",
      itemPower: 911,
      affixes: [
        { label: "Intelligence", value: "+155" },
        { label: "Maximum Life", value: "+1080" },
        { label: "Damage to Frozen Enemies", value: "+22%" },
        { label: "Resource Cost Reduction", value: "+8%" },
      ],
    },
  ],
  stats: [
    { label: "Intelligence", value: "4,820" },
    { label: "Maximum Life", value: "38,450" },
    { label: "Armor", value: "14,280" },
    { label: "Cold Resistance", value: "70%" },
    { label: "Fire Resistance", value: "70%" },
    { label: "Lightning Resistance", value: "70%" },
    { label: "Poison Resistance", value: "70%" },
    { label: "Shadow Resistance", value: "70%" },
    { label: "Critical Strike Chance", value: "22.5%" },
    { label: "Critical Strike Damage", value: "485%" },
    { label: "Vulnerable Damage", value: "210%" },
    { label: "Cooldown Reduction", value: "44%" },
    { label: "Movement Speed", value: "+30%" },
    { label: "Damage vs. Elites", value: "+28%" },
  ],
};
