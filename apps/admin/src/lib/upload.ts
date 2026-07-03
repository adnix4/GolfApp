import { ApiError } from '@gfp/shared-types';
import { storage } from './storage';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000';

/** ApiError.code thrown when the caller cancels an in-flight upload. */
export const UPLOAD_ABORTED = 'UPLOAD_ABORTED';

export interface UploadOptions {
  /** multipart field name — defaults to 'file'. */
  fieldName?: string;
  /** Called with fractional progress 0..1 as the file streams to the server. */
  onProgress?: (fraction: number) => void;
  /** Abort the upload (cancel button / screen unmount). */
  signal?: AbortSignal;
}

/**
 * POST a file as multipart/form-data with real upload-progress + cancellation.
 *
 * Why XHR and not fetch: browsers can't stream a request body through fetch, so
 * `fetch` reports no upload progress. XMLHttpRequest exposes `upload.onprogress`
 * and `abort()`, which is the web-correct equivalent of expo-file-system's
 * createUploadTask (native-only — it doesn't apply to this web-served admin app,
 * see problemList M6).
 */
export function uploadWithProgress<T>(
  path: string,
  file: File,
  opts: UploadOptions = {},
): Promise<T> {
  const { fieldName = 'file', onProgress, signal } = opts;

  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError(0, UPLOAD_ABORTED, 'Upload cancelled.'));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}${path}`);

    const token = storage.getAccessToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    // Deliberately no Content-Type — the browser sets the multipart boundary.

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
    }

    const onAbort = () => xhr.abort();
    signal?.addEventListener('abort', onAbort);
    const cleanup = () => signal?.removeEventListener('abort', onAbort);

    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        try {
          resolve(xhr.responseText ? (JSON.parse(xhr.responseText) as T) : ({} as T));
        } catch {
          reject(new ApiError(xhr.status, 'BAD_RESPONSE', 'Upload succeeded but the response was unreadable.'));
        }
      } else {
        let detail = 'Upload failed.';
        try {
          const body = JSON.parse(xhr.responseText);
          detail = body.detail ?? body.error ?? detail;
        } catch { /* keep default */ }
        reject(new ApiError(xhr.status, 'UPLOAD_FAILED', detail));
      }
    };

    xhr.onerror = () => { cleanup(); reject(new ApiError(0, 'NETWORK', 'Network error during upload.')); };
    xhr.onabort = () => { cleanup(); reject(new ApiError(0, UPLOAD_ABORTED, 'Upload cancelled.')); };

    const form = new FormData();
    form.append(fieldName, file);
    xhr.send(form);
  });
}
