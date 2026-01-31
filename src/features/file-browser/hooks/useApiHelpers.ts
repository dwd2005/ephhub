import { useCallback } from 'react';
import { App as AntApp } from 'antd';

/**
 * Small helper to unwrap ApiResult responses and surface toast errors consistently.
 * Keeps async calls concise across the file-browser feature.
 */
export function useApiHelpers() {
  const { message } = AntApp.useApp();

  // keep the reference stable to avoid effect re-runs
  const handle = useCallback(
    async <T,>(promise: Promise<ApiResult<T> | T>) => {
      const res: any = await promise;
      if (res && typeof res === 'object' && 'ok' in res) {
        if (!res.ok) {
          message.error(res.message || '操作失败');
          throw new Error(res.message);
        }
        return res.data as T;
      }
      return res as T;
    },
    [message]
  );

  return { handle };
}
