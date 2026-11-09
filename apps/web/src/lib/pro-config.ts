// The paid tier's display name, read from `app_config` (docs/PAYWALL.md section 6) so a rename
// needs no release. Missing or unreadable means "Pro". Safe for a browser or server client.
export const DEFAULT_PRO_NAME = "Pro";

export async function fetchProName(supabase: {
  from: (table: "app_config") => { select: (cols: string) => { eq: (col: string, value: string) => { maybeSingle: () => PromiseLike<{ data: { value?: string } | null }> } } };
}): Promise<string> {
  try {
    const { data } = await supabase.from("app_config").select("value").eq("key", "pro_display_name").maybeSingle();
    return data?.value?.trim() || DEFAULT_PRO_NAME;
  } catch {
    return DEFAULT_PRO_NAME;
  }
}
