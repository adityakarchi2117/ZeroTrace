import React from "react";
import { VisibilityLevel } from "@/lib/profileTypes";

interface Props {
  label: string;
  value: VisibilityLevel;
  onChange: (v: VisibilityLevel) => void;
}

const options: { value: VisibilityLevel; label: string }[] = [
  { value: "friends", label: "Friends" },
  { value: "everyone", label: "Everyone" },
  { value: "nobody", label: "Nobody" },
];

export default function VisibilitySelector({ label, value, onChange }: Props) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      <div className="flex gap-2">
        {options.map((opt) => (
          <button
            type="button"
            key={opt.value}
            className={`px-2 py-1 rounded-full text-xs border transition-colors ${
              value === opt.value
                ? "border-blue-500 dark:border-cyan-400 text-blue-600 dark:text-white bg-blue-50 dark:bg-transparent"
                : "border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600"
            }`}
            onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
