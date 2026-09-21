import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@database";
import { assertResult } from "@/lib/supabase";

export async function downloadPrivateFile(
  database: SupabaseClient<Database>,
  bucket: string,
  path: string,
  name: string,
) {
  const blob = assertResult(await database.storage.from(bucket).download(path));
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
