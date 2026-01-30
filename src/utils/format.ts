import dayjs from 'dayjs';

export function formatSize(size: number): string {
  if (size === 0) return '0B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.floor(Math.log(size) / Math.log(1024));
  const value = size / Math.pow(1024, index);
  return `${value.toFixed(1)} ${units[index]}`;
}

export function formatTime(ts: number | null | undefined): string {
  if (!ts) return '--';
  return dayjs(ts).format('YYYY-MM-DD HH:mm');
}

export function levelTagMeta(level: LevelTag) {
  switch (level) {
    case 'temp':
      return { color: '#f39c12', label: '临时' };
    case 'important':
      return { color: '#e74c3c', label: '重要' };
    case 'normal':
      return { color: '#2c3e50', label: '常规' };
    default:
      return { color: '#95a5a6', label: '未分类' };
  }
}
