import { useEffect, useState } from 'react';

const iconCache = new Map<string, string>();

export function useIcon(path: string | undefined, size: 'small' | 'normal' | 'large' = 'small') {
  const [icon, setIcon] = useState<string>('');

  useEffect(() => {
    if (!path) {
      setIcon('');
      return;
    }
    const key = `${size}|${path}`;
    if (iconCache.has(key)) {
      setIcon(iconCache.get(key)!);
      return;
    }

    let cancelled = false;
    window.api
      .getIcon({ path, size })
      .then((res: any) => {
        const data = res && typeof res === 'object' && 'ok' in res ? (res.ok ? res.data : '') : res;
        if (!cancelled && data) {
          iconCache.set(key, data);
          setIcon(data);
        }
      })
      .catch(() => {
        if (!cancelled) setIcon('');
      });

    return () => {
      cancelled = true;
    };
  }, [path, size]);

  return icon;
}
