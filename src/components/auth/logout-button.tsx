"use client";

import {useRouter} from "next/navigation";

import {createClient} from "@/lib/supabase/client";

export function LogoutButton({
  locale,
  label,
  className,
}: {
  locale: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push(`/${locale}/login`);
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}
