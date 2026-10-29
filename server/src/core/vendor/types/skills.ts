// Vendored from coleestrin/pd2-tools (MIT), upstream/main 7952f34.
export interface SkillDefinition {
  name: string;
  categories: string[];
}

export interface SkillBonus {
  type: "direct" | "tree" | "all" | "class" | "elemental";
  amount: number;
  target: string;
  source: string;
}
