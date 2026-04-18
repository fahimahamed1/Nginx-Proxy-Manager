// Multi-domain input with badge display, paste support, and keyboard navigation
import { useState, type KeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DomainInputProps {
  value: string[];
  onChange: (domains: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function DomainInput({
  value,
  onChange,
  placeholder = "Domain Name",
  className,
  disabled = false,
}: DomainInputProps) {
  const [input, setInput] = useState("");

  const addDomain = (domain: string) => {
    const trimmed = domain.trim().toLowerCase();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput("");
  };

  // Split on commas, spaces, or newlines for bulk paste
  const addMultiple = (text: string) => {
    const parts = text.split(/[,\s\n]+/).filter(Boolean);
    const newDomains = [...value];
    for (const part of parts) {
      const trimmed = part.trim().toLowerCase();
      if (trimmed && !newDomains.includes(trimmed)) {
        newDomains.push(trimmed);
      }
    }
    onChange(newDomains);
    setInput("");
  };

  const removeDomain = (domain: string) => {
    onChange(value.filter((d) => d !== domain));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault();
      if (input.trim()) {
        addDomain(input);
      }
    } else if (e.key === "Backspace" && input === "" && value.length > 0) {
      removeDomain(value[value.length - 1]);
    }
  };

  const handleBlur = () => {
    if (input.trim()) {
      addDomain(input);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (pasted.includes(",") || pasted.includes("\n") || pasted.includes(" ")) {
      e.preventDefault();
      addMultiple(pasted);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-wrap gap-1.5 min-h-[42px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
    >
      {value.map((domain) => (
        <Badge key={domain} variant="secondary" className="gap-1 font-mono text-xs">
          {domain}
          {!disabled && (
            <button
              type="button"
              onClick={() => removeDomain(domain)}
              className="ml-0.5 rounded-full hover:bg-foreground/10 p-0.5 cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </Badge>
      ))}
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onPaste={handlePaste}
        placeholder={value.length === 0 ? placeholder : ""}
        className="border-0 shadow-none p-0 h-auto flex-1 min-w-[180px] focus-visible:ring-0"
        disabled={disabled}
      />
    </div>
  );
}
