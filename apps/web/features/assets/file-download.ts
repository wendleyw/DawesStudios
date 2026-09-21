import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@database";
import { assertResult } from "@/lib/supabase";
import { saveBlob } from "@/features/shared/save-blob";

export async function downloadPrivateFile(
  database: SupabaseClient<Database>,
  bucket: string,
  path: string,
  name: string,
) {
  const blob = assertResult(await database.storage.from(bucket).download(path));
  saveBlob(blob, name);
}
