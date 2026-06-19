"use client";

import {useState} from "react";
import {useTranslations} from "next-intl";

import {Input} from "@/components/ui/input";
import {cn} from "@/lib/utils";

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
  showPasswordLabel?: string;
};

export function PasswordInput({className, showPasswordLabel, ...props}: PasswordInputProps) {
  const t = useTranslations("Common");
  const [visible, setVisible] = useState(false);
  const label = showPasswordLabel ?? t("showPassword");

  return (
    <div className={cn("space-y-1.5", className)}>
      <Input {...props} type={visible ? "text" : "password"} />
      <label className="flex cursor-pointer items-center justify-end gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={visible}
          onChange={(e) => setVisible(e.target.checked)}
          className="size-3.5 rounded border border-input accent-primary"
        />
        <span>{label}</span>
      </label>
    </div>
  );
}
