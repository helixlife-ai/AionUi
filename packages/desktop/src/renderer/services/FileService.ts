/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getBaseUrl } from '@/common/adapter/httpBridge';
import { trackUpload, type UploadSource } from '@/renderer/hooks/file/useUploadState';

/** Sentinel error message used when an upload is cancelled by the caller. */
export const UPLOAD_ABORTED_ERROR = 'Upload aborted';

/** Sentinel when the server (or client pre-check) rejects an oversized upload. */
export const FILE_TOO_LARGE_ERROR = 'FILE_TOO_LARGE';

/** Sentinel when the client rejects a file type outside the attach allow-list. */
export const FILE_UNSUPPORTED_ERROR = 'FILE_UNSUPPORTED';

/** Backend upload limit for conversation attachments (HTTP 413). */
export const MAX_UPLOAD_FILE_SIZE_MB = 30;
export const MAX_UPLOAD_FILE_SIZE_BYTES = MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024;

/** True when an attachment should be rejected for exceeding the upload limit. */
export function isUploadFileTooLarge(size: number): boolean {
  // Treat 30MB exactly as over-limit so "30mb.pdf"-class files are blocked client-side
  // before a long upload that often ends as proxy 502 instead of HTTP 413.
  return size >= MAX_UPLOAD_FILE_SIZE_BYTES;
}

export interface UploadFileOptions {
  /** Cancel the upload from the outside. Closing the XHR also frees the backend connection. */
  signal?: AbortSignal;
}

/**
 * Upload a file to the backend via HTTP multipart.
 *
 * Works in both Electron (via `http://127.0.0.1:<backendPort>`) and WebUI
 * (same-origin reverse-proxied). Conversation-bound uploads go to the
 * workspace uploads directory; pre-conversation uploads go to temp storage.
 *
 * Field names match the backend contract exactly (snake_case): `file`,
 * `file_name` (optional), `conversation_id` (optional). The response is
 * `ApiResponse<String>` where `data` is the absolute file path on disk.
 *
 * @param onProgress Optional callback receiving upload percentage (0-100).
 * @param options    Optional bag — currently supports an `AbortSignal` so callers can cancel.
 */
export async function uploadFileViaHttp(
  file: File,
  conversation_id?: string,
  onProgress?: (percent: number) => void,
  file_name?: string,
  options?: UploadFileOptions
): Promise<string> {
  if (isUploadFileTooLarge(file.size)) {
    return Promise.reject(new Error(FILE_TOO_LARGE_ERROR));
  }

  const formData = new FormData();
  formData.append('file', file);
  if (file_name) {
    formData.append('file_name', file_name);
  }
  if (conversation_id) {
    formData.append('conversation_id', conversation_id);
  }

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${getBaseUrl()}/api/fs/upload`);

    // Wire AbortSignal → xhr.abort. Closing the XHR tears down the underlying
    // socket; the backend (axum/multer) treats the truncated multipart body as
    // a client disconnect and stops reading. No explicit cancel IPC needed.
    const signal = options?.signal;
    let onSignalAbort: (() => void) | null = null;
    if (signal) {
      if (signal.aborted) {
        // Caller asked to abort before send — bail out without opening a socket.
        reject(new Error(UPLOAD_ABORTED_ERROR));
        return;
      }
      onSignalAbort = () => {
        try {
          xhr.abort();
        } catch {
          /* ignore */
        }
      };
      signal.addEventListener('abort', onSignalAbort);
    }

    const detachSignal = (): void => {
      if (signal && onSignalAbort) {
        signal.removeEventListener('abort', onSignalAbort);
        onSignalAbort = null;
      }
    };

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
    }

    xhr.addEventListener('load', () => {
      detachSignal();
      if (xhr.status === 413 || (xhr.status === 502 && isUploadFileTooLarge(file.size))) {
        reject(new Error(FILE_TOO_LARGE_ERROR));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
        return;
      }
      try {
        const result = JSON.parse(xhr.responseText) as { success: boolean; data?: string };
        if (!result.success || typeof result.data !== 'string' || !result.data) {
          reject(new Error('Upload failed: server returned unsuccessful response'));
        } else {
          resolve(result.data);
        }
      } catch {
        reject(new Error('Upload failed: invalid server response'));
      }
    });

    xhr.addEventListener('error', () => {
      detachSignal();
      reject(new Error('Upload failed: network error'));
    });

    xhr.addEventListener('abort', () => {
      detachSignal();
      reject(new Error(UPLOAD_ABORTED_ERROR));
    });

    xhr.send(formData);
  });
}
// Simple formatBytes implementation moved from deleted updateConfig
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// ===== 文件类型支持配置 =====
// 注意：当前为预先设计的架构，支持所有文件类型
// 以下常量为将来可能的文件类型过滤功能预留

/** 支持的图片文件扩展名 */
export const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];

/** 支持的文档文件扩展名 */
export const documentExts = ['.pdf', '.doc', '.docx', '.pptx', '.xlsx', '.odt', '.odp', '.ods'];

/** 支持的文本文件扩展名 */
export const textExts = [
  '.txt',
  '.md',
  '.json',
  '.xml',
  '.csv',
  '.log',
  '.js',
  '.ts',
  '.jsx',
  '.tsx',
  '.html',
  '.css',
  '.scss',
  '.py',
  '.java',
  '.cpp',
  '.c',
  '.h',
  '.go',
  '.rs',
  '.yml',
  '.yaml',
  '.toml',
  '.ini',
  '.conf',
  '.config',
];

/** 所有支持的附件扩展名（会话/首页上传白名单）。 */
export const allSupportedExts = [...imageExts, ...documentExts, ...textExts];

// 文件元数据接口
export interface FileMetadata {
  name: string;
  path: string;
  size: number;
  type: string;
  lastModified: number;
}

/**
 * 检查文件是否被支持。
 * 空的 supportedExts 表示不限制类型（允许全部）。
 */
export function isSupportedFile(file_name: string, supportedExts: string[]): boolean {
  if (!supportedExts || supportedExts.length === 0) {
    return true;
  }
  const ext = getFileExtension(file_name);
  return Boolean(ext) && supportedExts.includes(ext);
}

// 获取文件扩展名
export function getFileExtension(file_name: string): string {
  const lastDotIndex = file_name.lastIndexOf('.');
  return lastDotIndex > -1 ? file_name.substring(lastDotIndex).toLowerCase() : '';
}

import { AIONUI_TIMESTAMP_REGEX } from '@/common/config/constants';

// 清理AionUI时间戳后缀，返回原始文件名
export function cleanAionUITimestamp(file_name: string): string {
  return file_name.replace(AIONUI_TIMESTAMP_REGEX, '$1');
}

// 从文件路径获取清理后的文件名（用于UI显示）
export function getCleanFileName(file_path: string): string {
  const file_name = file_path.split(/[\\/]/).pop() || '';
  return cleanAionUITimestamp(file_name);
}

// 从文件路径数组获取清理后的文件名数组（用于消息格式化）
export function getCleanFileNames(file_paths: string[]): string[] {
  return file_paths.map(getCleanFileName);
}

/**
 * 过滤支持的文件
 */
export function filterSupportedFiles(files: FileMetadata[], supportedExts: string[]): FileMetadata[] {
  return files.filter((file) => isSupportedFile(file.name, supportedExts));
}

// 从拖拽事件中提取文件 (纯工具函数，不处理业务逻辑)
export function getFilesFromDropEvent(event: DragEvent): FileMetadata[] {
  const files: FileMetadata[] = [];

  if (!event.dataTransfer?.files) {
    return files;
  }

  for (let i = 0; i < event.dataTransfer.files.length; i++) {
    const file = event.dataTransfer.files[i];
    // 在 Electron 环境中，拖拽文件会有额外的 path 属性
    const electronFile = file as File & { path?: string };

    files.push({
      name: file.name,
      path: electronFile.path || '', // 原始路径，可能为空
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
    });
  }

  return files;
}

// 从拖拽事件中提取文本
export function getTextFromDropEvent(event: DragEvent): string {
  return event.dataTransfer?.getData('text/plain') || '';
}

// 格式化文件大小（使用统一的formatBytes实现）
export function formatFileSize(bytes: number): string {
  return formatBytes(bytes, 2); // 保持2位精度以兼容之前的行为
}

/**
 * 检查是否为图片文件
 */
export function isImageFile(file_name: string): boolean {
  return isSupportedFile(file_name, imageExts);
}

/**
 * 检查是否为文档文件
 */
export function isDocumentFile(file_name: string): boolean {
  return isSupportedFile(file_name, documentExts);
}

/**
 * 检查是否为文本文件
 */
export function isTextFile(file_name: string): boolean {
  return isSupportedFile(file_name, textExts);
}

class FileServiceClass {
  /**
   * Process files from drag and drop events, uploading any file that lacks a
   * native disk path via HTTP multipart.
   *
   * In Electron, files dragged from the OS file manager already expose an
   * absolute `path`, so we skip upload for those. Anything without a path
   * (WebUI, synthetic File objects, browser-sourced drags) is uploaded to the
   * backend, which returns the absolute stored path.
   */
  async processDroppedFiles(
    files: FileList,
    conversation_id?: string,
    source: UploadSource = 'sendbox'
  ): Promise<FileMetadata[]> {
    const processedFiles: FileMetadata[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // In Electron environment, dragged files have additional path property
      const electronFile = file as File & { path?: string };

      if (!isSupportedFile(file.name, allSupportedExts)) {
        throw new Error(FILE_UNSUPPORTED_ERROR);
      }

      let file_path = electronFile.path || '';

      // If no valid path (WebUI or some dragged files may not have paths), upload via HTTP multipart
      if (!file_path) {
        // Reject before creating the progress tracker so oversized files never
        // flash an "uploading..." bar and then silently disappear on 502.
        if (isUploadFileTooLarge(file.size)) {
          throw new Error(FILE_TOO_LARGE_ERROR);
        }
        // Each upload owns its own AbortController; the tracker exposes an `abort()`
        // that triggers the signal so user-driven cancel and conversation-switch
        // bulk-abort go through the same path.
        const controller = new AbortController();
        const tracker = trackUpload(file.size, {
          source,
          name: file.name,
          conversationId: conversation_id || undefined,
          onAbort: () => controller.abort(),
        });
        try {
          file_path = await uploadFileViaHttp(file, conversation_id || '', tracker.onProgress, undefined, {
            signal: controller.signal,
          });
        } catch (error) {
          if (error instanceof Error && error.message === UPLOAD_ABORTED_ERROR) {
            // User-initiated abort: drop this file silently (the UI already reflects it).
            continue;
          }
          // Surface size-limit and network failures to callers (do not swallow 502).
          console.error('Failed to upload dragged file:', error);
          throw error;
        } finally {
          tracker.finish();
        }
      }

      processedFiles.push({
        name: file.name,
        path: file_path,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
      });
    }

    return processedFiles;
  }
}

export const FileService = new FileServiceClass();
