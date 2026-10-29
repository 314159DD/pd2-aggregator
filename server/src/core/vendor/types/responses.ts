// Vendored from coleestrin/pd2-tools (MIT), upstream/main 7952f34.
// Trimmed: realStats/damageCalculation fields and their damage/stats imports dropped.
import { ICharacter } from "./character";
import { IItem } from "./item";
import { IMercenary } from "./mercenary";

export interface CalculatedSkillLevel {
  skill: string;
  level: number;
  baseLevel?: number;
}

export interface CharacterResponse {
  character: ICharacter | null;
  mercenary?: IMercenary | null;
  items: IItem[] | null;
  nullReason?: string;
  realSkills?: CalculatedSkillLevel[];
  lastUpdated?: number;
  accountName?: string;
  [key: string]: unknown;
}

export interface CharacterData extends CharacterResponse {
  character: ICharacter;
  items: IItem[];
}
