import { isAdmin } from "@/lib/admin";
import { startCrawlRequest } from "@/lib/crawl-dispatch";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return startCrawlRequest(request, {
    admin: isAdmin(data?.claims), token: process.env.CRAWL_GITHUB_TOKEN,
    create: async input => {
      const { data: id, error } = await supabase.rpc("admin_create_crawl_run", { settings: input });
      return error ? null : id;
    },
    fail: async id => { await supabase.rpc("admin_fail_crawl_dispatch", { for_run: id }); },
  });
}
