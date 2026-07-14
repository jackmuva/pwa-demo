import type {
  CompletedUpload,
  PlaudUploadFileType,
  PresignedUploadUrls,
  TranscriptionTask,
  UploadPart,
} from "@/lib/plaud-transcription";

export type TranscribePhase = "uploading" | "finalizing" | "submitting" | "processing";

export interface TranscribeProgress {
  phase: TranscribePhase;
  percent?: number;
  status?: string;
}

const TERMINAL_STATUSES = new Set(["SUCCESS", "FAILURE", "REVOKED"]);
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 120; // ~10 minutes

/** Default transcription params — kept in sync with the embedded-playground reference. */
const DEFAULT_TRANSCRIPTION_PARAMS = {
  transcribe: {
    language: "auto",
    model: "plaud-fast-whisper" as const,
  },
  vad: {
    decode_silence: false,
  },
  diarization: {
    enabled: false,
    return_embedding: false,
  },
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `${url} failed (${res.status})`);
  return json as T;
}

/**
 * Uploads an exported audio file to Plaud's managed storage via the presigned-URL
 * multipart flow, then submits the resulting download URL for transcription and polls
 * until it reaches a terminal status.
 *
 * `buffer` holds the exported file's raw bytes. Read them through the native bridge with
 * `readExportedFile(outputPath)` — do NOT `fetch(Capacitor.convertFileSrc(...))`, which
 * fails when the WebView loads a remote origin (cross-origin custom scheme, blocked by
 * CORS).
 */
export async function transcribeExportedFile(
  buffer: ArrayBuffer,
  filetype: PlaudUploadFileType,
  accessToken: string,
  onProgress?: (p: TranscribeProgress) => void,
): Promise<TranscriptionTask> {
  onProgress?.({ phase: "uploading", percent: 0 });
  const presigned = await postJson<PresignedUploadUrls>("/api/transcription/presign", {
    access_token: accessToken,
    filesize: buffer.byteLength,
    filetype,
  });
  console.log("presigned", presigned);

  const partList: UploadPart[] = [];
  for (const part of presigned.Parts) {
    const start = (part.PartNumber - 1) * presigned.ChunkSize;
    const end = Math.min(start + presigned.ChunkSize, buffer.byteLength);
    const putRes = await fetch(part.PresignedUrl, {
      method: "PUT",
      body: buffer.slice(start, end),
    });
    if (!putRes.ok) {
      throw new Error(`Failed to upload part ${part.PartNumber} (${putRes.status})`);
    }
    const etag = putRes.headers.get("etag");
    if (!etag) {
      throw new Error(
        `Part ${part.PartNumber} upload didn't return an ETag header — the S3 bucket's ` +
        `CORS config must expose it (ExposeHeaders: ["ETag"]) for browser uploads`,
      );
    }
    partList.push({ PartNumber: part.PartNumber, ETag: etag });
    onProgress?.({
      phase: "uploading",
      percent: Math.round((part.PartNumber / presigned.Parts.length) * 100),
    });
  }

  onProgress?.({ phase: "finalizing" });
  const completed = await postJson<CompletedUpload>("/api/transcription/complete", {
    access_token: accessToken,
    file_id: presigned.FileId,
    upload_id: presigned.UploadId,
    part_list: partList,
    filetype,
  });

  onProgress?.({ phase: "submitting" });
  let task = await postJson<TranscriptionTask>("/api/transcription/submit", {
    file_url: completed.DownloadUrl,
    params: DEFAULT_TRANSCRIPTION_PARAMS,
  });

  onProgress?.({ phase: "processing", status: task.status });
  let attempts = 0;
  while (!TERMINAL_STATUSES.has(task.status)) {
    if (++attempts > MAX_POLL_ATTEMPTS) {
      throw new Error(`Transcription timed out while polling (status ${task.status})`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`/api/transcription/status/${task.transcription_id}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `status poll failed (${res.status})`);
    task = json;
    onProgress?.({ phase: "processing", status: task.status });
  }

  if (task.status !== "SUCCESS") {
    throw new Error(`Transcription ended with status ${task.status}`);
  }
  return task;
}
