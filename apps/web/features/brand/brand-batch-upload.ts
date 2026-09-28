"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import type { UploadMime } from "@/features/shared/upload-rules";
import {
  brandQueryKeys,
  findBrandAssetById,
  insertBrandAsset,
  removeBrandAssetFile,
  uploadBrandAssetFile,
} from "./brand-data";
import {
  assetCategoryForMime,
  assetNameFromFileName,
  validateBrandFile,
  validationMessage,
} from "./brand-model";

export type BatchUploadItem = {
  key: string;
  fileName: string;
  folderId: string | null;
  status: "queued" | "uploading" | "done" | "failed";
  error?: string;
};

type Job = BatchUploadItem & {
  file: File;
  assetId: string;
  /** Set once the file is in Storage, so a retry inserts the row without uploading it again. */
  storagePath?: string;
};

/**
 * Several files dropped (or picked) at once, each filed as its own asset in the folder it was
 * dropped on, named after the file and categorized by its type. No form stands between the drop
 * and the upload: the agency adds details later from the asset's dialog. Files upload one at a
 * time. Each keeps its asset id across retries, so a retry after a lost response never adds a
 * second row, and a file whose row cannot be written is removed from Storage again.
 */
export function useBrandBatchUpload(clientId: string, allowed: readonly UploadMime[]) {
  const { database } = useAuth();
  const cache = useQueryClient();
  const jobs = useRef<Job[]>([]);
  const running = useRef(false);
  const [items, setItems] = useState<BatchUploadItem[]>([]);

  const publish = useCallback(() => {
    setItems(
      jobs.current.map(({ key, fileName, folderId, status, error }) => ({
        key,
        fileName,
        folderId,
        status,
        error,
      })),
    );
  }, []);

  /** Replaces one job's record; jobs are never changed in place. */
  const patch = useCallback((key: string, changes: Partial<Job>) => {
    jobs.current = jobs.current.map((job) => (job.key === key ? { ...job, ...changes } : job));
  }, []);

  const uploadOne = useCallback(
    async (job: Job) => {
      const extension = validateBrandFile(job.file, allowed);
      let storagePath = job.storagePath;
      if (!storagePath) {
        storagePath = `${clientId}/${crypto.randomUUID()}.${extension}`;
        await uploadBrandAssetFile(database, { path: storagePath, file: job.file });
        patch(job.key, { storagePath });
      }
      if (await findBrandAssetById(database, { id: job.assetId })) return;
      try {
        await insertBrandAsset(database, {
          id: job.assetId,
          clientId,
          name: assetNameFromFileName(job.file.name),
          category: assetCategoryForMime(job.file.type),
          description: "",
          tags: [],
          mimeType: job.file.type,
          storagePath,
          folderId: job.folderId,
        });
      } catch (error) {
        // The row may have committed before the response was lost; only an orphan is removed.
        if (!(await findBrandAssetById(database, { id: job.assetId }).catch(() => true))) {
          await removeBrandAssetFile(database, { path: storagePath }).catch(() => {});
          patch(job.key, { storagePath: undefined });
        }
        throw error;
      }
    },
    [allowed, clientId, database, patch],
  );

  const drain = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      for (
        let job = jobs.current.find((item) => item.status === "queued");
        job;
        job = jobs.current.find((item) => item.status === "queued")
      ) {
        patch(job.key, { status: "uploading", error: undefined });
        publish();
        try {
          await uploadOne(jobs.current.find((item) => item.key === job!.key)!);
          patch(job.key, { status: "done" });
        } catch (error) {
          patch(job.key, { status: "failed", error: validationMessage(error) });
        }
        publish();
        await cache.invalidateQueries({ queryKey: [brandQueryKeys.assets] });
      }
    } finally {
      running.current = false;
    }
  }, [cache, patch, publish, uploadOne]);

  const add = useCallback(
    (files: Iterable<File>, folderId: string | null) => {
      const added: Job[] = Array.from(files, (file) => ({
        key: crypto.randomUUID(),
        assetId: crypto.randomUUID(),
        file,
        fileName: file.name,
        folderId,
        status: "queued",
      }));
      jobs.current = [...jobs.current, ...added];
      publish();
      void drain();
    },
    [drain, publish],
  );

  const retry = useCallback(() => {
    jobs.current = jobs.current.map((job) =>
      job.status === "failed" ? { ...job, status: "queued" } : job,
    );
    publish();
    void drain();
  }, [drain, publish]);

  /** Clears finished rows; anything still uploading stays listed. */
  const dismiss = useCallback(() => {
    jobs.current = jobs.current.filter(
      (job) => job.status === "queued" || job.status === "uploading",
    );
    publish();
  }, [publish]);

  return { items, add, retry, dismiss };
}
