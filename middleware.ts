import {type NextRequest} from "next/server";
import createIntlMiddleware from "next-intl/middleware";

import {routing} from "@/i18n/routing";
import {createSupabaseMiddlewareClient} from "@/lib/supabase/middleware";

/**
 * next-intl：依 `Accept-Language`、locale cookie 與 URL 前綴偵測語系；
 * 無前綴路徑（例如 `/`）會重新導向至對應的 `/[locale]/...`。
 */
const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  const response = intlMiddleware(request);

  const supabase = createSupabaseMiddlewareClient(request, response);
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
