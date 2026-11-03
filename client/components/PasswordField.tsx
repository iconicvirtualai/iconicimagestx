import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { generateTemporaryPassword } from "@shared/passwordAccount";

export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  allowGenerate = false,
  hint,
  tone = "light",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "new-password" | "current-password";
  allowGenerate?: boolean;
  hint?: string;
  tone?: "light" | "dark";
}) {
  const [visible, setVisible] = useState(false);
  const dark = tone === "dark";
  return (
    <div>
      <label htmlFor={id} className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${dark ? "text-zinc-400" : "text-gray-500"}`}>
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          className={`min-w-0 flex-1 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30 ${dark ? "bg-zinc-900 border border-zinc-700 text-white" : "bg-gray-50 border border-gray-200"}`}
        />
        <button
          type="button"
          className={`rounded-xl border px-3 text-[10px] font-black uppercase tracking-widest ${dark ? "border-zinc-700 text-zinc-300" : "border-gray-200 text-gray-500 hover:text-black"}`}
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
        {allowGenerate ? (
          <button
            type="button"
            className="rounded-xl border border-[#0d9488]/30 px-3 text-[10px] font-black uppercase tracking-widest text-[#0d9488]"
            onClick={() => {
              onChange(generateTemporaryPassword());
              setVisible(true);
            }}
          >
            Generate
          </button>
        ) : null}
      </div>
      {hint ? <p className="mt-2 text-xs text-gray-400">{hint}</p> : null}
    </div>
  );
}
