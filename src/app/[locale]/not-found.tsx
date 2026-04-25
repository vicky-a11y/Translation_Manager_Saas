import {getTranslations} from "next-intl/server";

import {Link} from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("NotFound");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t("description")}</p>
      <Link href="/" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
        {t("homeLink")}
      </Link>
    </main>
  );
}
