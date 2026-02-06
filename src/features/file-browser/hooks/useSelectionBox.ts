import { useCallback, useRef } from 'react';
import { useStore } from '@/store/useStore';

export const useSelectionBox = (
  fileAreaRef: React.RefObject<HTMLDivElement>,
  fileRefs: React.MutableRefObject<Record<string, HTMLDivElement>>
) => {
  const {
    selectionBox,
    setSelectionBox,
    isDragging,
    setIsDragging,
    clearSelection,
    setSelected,
    renamingPath,
    setRenamingPath
  } = useStore();

  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('.file-card') || target.closest('.list-item')) return;

      if (renamingPath) {
        (document.activeElement as HTMLElement | null)?.blur?.();
        setRenamingPath(null);
        return;
      }

      clearSelection();
      const rect = fileAreaRef.current?.getBoundingClientRect();
      if (!rect) return;
      dragStartRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      setIsDragging(true);
    },
    [clearSelection, fileAreaRef, renamingPath, setIsDragging, setRenamingPath]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging || !dragStartRef.current) return;
      const rect = fileAreaRef.current?.getBoundingClientRect();
      if (!rect) return;
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;
      const startX = dragStartRef.current.x;
      const startY = dragStartRef.current.y;
      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);
      setSelectionBox({ x, y, width, height });
      const selectedPaths: string[] = [];
      Object.entries(fileRefs.current).forEach(([path, el]) => {
        const elRect = el.getBoundingClientRect();
        const elX = elRect.left - rect.left;
        const elY = elRect.top - rect.top;
        const elRight = elX + elRect.width;
        const elBottom = elY + elRect.height;
        if (elX < x + width && elRight > x && elY < y + height && elBottom > y) {
          selectedPaths.push(path);
        }
      });
      setSelected(selectedPaths);
    },
    [fileAreaRef, fileRefs, isDragging, setSelected, setSelectionBox]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setSelectionBox(null);
    dragStartRef.current = null;
  }, [setIsDragging, setSelectionBox]);

  return {
    selectionBox,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp
  };
};
