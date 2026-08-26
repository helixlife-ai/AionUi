import { AIONUI_FILES_MARKER, AIONUI_TIMESTAMP_REGEX } from '@/common/config/constants';
import { type ChatFileRef, chatFileRefKey, chatFileRefPath, uploadFileRef } from '@/common/types/chatFile';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';

/**
 * Collect the send-path file refs from the two selection sources, source-tagged
 * and deduped. `uploadFile` paths (device uploads → managed dir) become `upload`
 * refs; `atPath` items carrying a `chatRef` (Explorer tree → `project`, backend
 * machine picker → `local`) are sent verbatim; bare `atPath` entries without a
 * `chatRef` fall back to `upload`. The backend resolves each ref to an absolute
 * path — the front-end no longer builds paths nor splices the `[[AION_FILES]]`
 * marker into the message body.
 */
export const collectChatFileRefs = (uploadFile: string[], atPath: Array<string | FileOrFolderItem>): ChatFileRef[] => {
  const refs: ChatFileRef[] = [];
  const seen = new Set<string>();
  const push = (ref: ChatFileRef): void => {
    const key = chatFileRefKey(ref);
    if (seen.has(key)) return;
    seen.add(key);
    refs.push(ref);
  };

  for (const path of uploadFile) {
    if (path) push(uploadFileRef(path));
  }
  for (const item of atPath) {
    if (typeof item === 'string') {
      if (item) push(uploadFileRef(item));
    } else if (item.chatRef) {
      push(item.chatRef);
    } else if (item.path) {
      push(uploadFileRef(item.path));
    }
  }
  return refs;
};

/**
 * Split refs back into the two send-box selection lanes — the inverse of
 * {@link collectChatFileRefs}, used when a queued command is edited back into
 * the box. `upload` refs return as paths (the `uploadFile` lane); `project` and
 * `local` refs rebuild a selection item carrying their `chatRef` (the `atPath`
 * lane) so a re-send collects the same ref again.
 */
export const splitChatFileRefs = (refs: ChatFileRef[]): { uploadFiles: string[]; atPath: FileOrFolderItem[] } => {
  const uploadFiles: string[] = [];
  const atPath: FileOrFolderItem[] = [];
  for (const ref of refs) {
    if (ref.kind === 'upload') {
      uploadFiles.push(ref.path);
    } else {
      const path = ref.kind === 'project' ? ref.relative_path : ref.path;
      atPath.push({
        path,
        name: path.split(/[\\/]/).pop() || path,
        isFile: true,
        chatRef: ref,
      });
    }
  }
  return { uploadFiles, atPath };
};

/** Build the local optimistic row using the same marker format as persisted messages. */
export const buildDisplayMessage = (input: string, files: ChatFileRef[], workspacePath: string): string => {
  if (files.length === 0) return input;
  const normalizedWorkspace = workspacePath.replace(/[\\/]+$/, '');
  const displayPaths = files.map((ref) => {
    const filePath = chatFileRefPath(ref).replace(AIONUI_TIMESTAMP_REGEX, '$1');
    if (!normalizedWorkspace || ref.kind === 'project') return ref.kind === 'project' && normalizedWorkspace
      ? `${normalizedWorkspace}/${filePath}`
      : filePath;
    return filePath;
  });
  return `${input}\n\n${AIONUI_FILES_MARKER}\n${displayPaths.join('\n')}`;
};
