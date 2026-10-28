// Vendored from coleestrin/pd2-tools (MIT), upstream/main 7952f34.
import { IItem } from "./item";

export interface IMercenary {
  id: number;
  name_id: number;
  type: number;
  experience: number;
  name: string;
  description: string;
  items: IItem[];
}
