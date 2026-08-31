import { httpRequest } from '@/common/adapter/httpBridge';

export const removeWorkspaceEntry = (path: string, workspace?: string): Promise<void> =>
  httpRequest<void>('POST', '/api/fs/remove', { path, workspace });

export const renameWorkspaceEntry = (path: string, new_name: string, workspace?: string): Promise<void> =>
  httpRequest<void>('POST', '/api/fs/rename', { path, new_name, workspace });
