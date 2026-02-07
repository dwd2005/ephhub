import { useCallback } from 'react';
import { App as AntApp } from 'antd';

type HandleOptions = {
  onRetry?: () => Promise<void>;
};

const errorTips: Record<string, { title: string; suggestion: string }> = {
  ENOENT: {
    title: '目标不存在',
    suggestion: '可能已被移动或删除，建议刷新列表后再试。'
  },
  EACCES: {
    title: '权限不足',
    suggestion: '请检查文件权限或以管理员身份运行后重试。'
  },
  EPERM: {
    title: '操作被拒绝',
    suggestion: '可能被系统保护或占用，请关闭占用程序后重试。'
  },
  EBUSY: {
    title: '文件被占用',
    suggestion: '请关闭占用程序或等待文件释放后重试。'
  },
  ENOTEMPTY: {
    title: '目录非空',
    suggestion: '请先清空目录内容再操作。'
  },
  EEXIST: {
    title: '目标已存在',
    suggestion: '请更换名称或删除已有目标后重试。'
  },
  FS_SYNC_REQUIRED: {
    title: '可能存在不一致',
    suggestion: '建议手动重新扫描更新数据库后再继续操作。'
  }
};

/**
 * Small helper to unwrap ApiResult responses and surface toast errors consistently.
 * Keeps async calls concise across the file-browser feature.
 */
export function useApiHelpers() {
  const { message, modal } = AntApp.useApp();

  // keep the reference stable to avoid effect re-runs
  const handle = useCallback(
    async <T,>(promise: Promise<ApiResult<T> | T>, options?: HandleOptions) => {
      const res: any = await promise;
      if (res && typeof res === 'object' && 'ok' in res) {
        if (!res.ok) {
          const code = res.code as string | undefined;
          const tip = code ? errorTips[code] : null;
          if (tip) {
            const content = `${res.message || '操作失败'}。${tip.suggestion}`;
            if (options?.onRetry) {
              modal.confirm({
                title: tip.title,
                content,
                okText: '重试',
                cancelText: '关闭',
                onOk: async () => {
                  await options.onRetry?.();
                }
              });
            } else {
              modal.warning({
                title: tip.title,
                content,
                okText: '我知道了'
              });
            }
          } else {
            message.error(res.message || '操作失败');
          }
          throw new Error(res.message);
        }
        return res.data as T;
      }
      return res as T;
    },
    [message, modal]
  );

  return { handle };
}
