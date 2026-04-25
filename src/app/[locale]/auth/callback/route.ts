import {type NextRequest, NextResponse} from "next/server";

import {createClient} from "@/lib/supabase/server";
import {getPostLoginHref} from "@/lib/tenant/post-auth";

export async function GET(
  request: NextRequest,
  {params}: {params: Promise<{locale: string}>},
) {
  const {locale} = await params;
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextParam = requestUrl.searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
    const {
      data: {user},
    } = await supabase.auth.getUser();
    if (user) {
      const dest = nextParam
        ? decodeURIComponent(nextParam)
        : await getPostLoginHref(supabase, locale, user.id, user.email);
      return NextResponse.redirect(new URL(dest, requestUrl.origin));
    }
  }

  const fallback = nextParam ?? `/${locale}/welcome`;
  return NextResponse.redirect(new URL(fallback, requestUrl.origin));
}
