"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UiState } from "@/lib/url-state";

const CLASSES = ["Amazon", "Assassin", "Barbarian", "Druid", "Necromancer", "Paladin", "Sorceress"];

type Props = {
  initial: UiState;
  onSubmit: (s: UiState) => void;
};

export function FilterForm({ initial, onSubmit }: Props) {
  const [s, setS] = useState<UiState>(initial);

  return (
    <div className="space-y-4 rounded-lg border p-4">
      {/* Mode toggle */}
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={s.mode === "guide"}
            onChange={() => setS({ ...s, mode: "guide" })}
          />
          Build a guide
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={s.mode === "diff"}
            onChange={() => setS({ ...s, mode: "diff" })}
          />
          Diff my character (Phase 2)
        </label>
      </div>

      {s.mode === "diff" && (
        <Input
          placeholder="Character name or account name"
          value={s.diffName}
          onChange={(e) => setS({ ...s, diffName: e.target.value })}
        />
      )}

      {/* Game mode */}
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={s.filter.gameMode === "hardcore"}
            onChange={() => setS({ ...s, filter: { ...s.filter, gameMode: "hardcore" } })}
          />
          Hardcore
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={s.filter.gameMode === "softcore"}
            onChange={() => setS({ ...s, filter: { ...s.filter, gameMode: "softcore" } })}
          />
          Softcore
        </label>
      </div>

      {/* Class */}
      <div>
        <label className="block text-sm mb-1">Class</label>
        <Select
          value={s.filter.className ?? "Paladin"}
          onValueChange={(v) => setS({ ...s, filter: { ...s.filter, className: v } })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CLASSES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Min level */}
      <div>
        <label className="block text-sm mb-1">
          Min character level: <span className="font-semibold">{s.filter.minLevel ?? 80}</span>
        </label>
        <Slider
          min={1}
          max={99}
          value={[s.filter.minLevel ?? 80]}
          onValueChange={(v) => setS({ ...s, filter: { ...s.filter, minLevel: v[0] } })}
        />
      </div>

      {/* Skills (Phase 2) */}
      <div>
        <label className="block text-sm mb-1 text-muted-foreground">
          Skills (Phase 2 — affects affix mods only). JSON: [{"{"}
          &quot;name&quot;:&quot;Holy Bolt&quot;,&quot;minLevel&quot;:20{"}"}]
        </label>
        <Input
          value={JSON.stringify(s.skills)}
          onChange={(e) => {
            try {
              setS({ ...s, skills: JSON.parse(e.target.value) });
            } catch {
              // ignore invalid JSON in mid-edit
            }
          }}
        />
      </div>

      <Button onClick={() => onSubmit(s)}>Generate Guide</Button>
    </div>
  );
}
