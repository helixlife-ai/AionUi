import { ipcBridge } from '@/common';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { filterPathsWithinUploadLimit } from '@/renderer/utils/file/fileAttachErrors';

interface UseOpenFileSelectorOptions {
  onFilesSelected: (files: string[]) => void;
}

interface UseOpenFileSelectorResult {
  openFileSelector: () => void;
  onSlashBuiltinCommand: (name: string) => void;
}

/**
 * Shared open-file selector behavior for send boxes.
 * Unifies '+' button and '/open' builtin command handling.
 *
 * In Electron: opens native file dialog.
 * In WebUI: triggers DirectorySelectionModal via bridge events.
 */
export function useOpenFileSelector(options: UseOpenFileSelectorOptions): UseOpenFileSelectorResult {
  const { onFilesSelected } = options;
  const { t } = useTranslation();

  const openFileSelector = useCallback(() => {
    void ipcBridge.dialog.showOpen
      .invoke({ properties: ['openFile', 'multiSelections'] })
      .then(async (files) => {
        if (!files || files.length === 0) {
          return;
        }
        const withinLimit = await filterPathsWithinUploadLimit(files, t);
        if (withinLimit.length > 0) {
          onFilesSelected(withinLimit);
        }
      })
      .catch((error) => {
        // In WebUI, dialog may fail if DirectorySelectionModal is not rendered
        // or bridge is not properly connected. Log error for debugging.
        console.warn('[useOpenFileSelector] Failed to open file selector:', error);
      });
  }, [onFilesSelected, t]);

  const onSlashBuiltinCommand = useCallback(
    (name: string) => {
      if (name === 'open') {
        openFileSelector();
      }
    },
    [openFileSelector]
  );

  return {
    openFileSelector,
    onSlashBuiltinCommand,
  };
}
