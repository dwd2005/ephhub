import React, { useEffect, useRef, useState } from 'react';
import { Flex, Input, Tag } from 'antd';
import { FolderOpenOutlined } from '@ant-design/icons';
import { formatTime, levelTagMeta } from '@/utils/format';
import FileIcon from './FileIcon';

type Props = {
  files: FileEntry[];
  selected: string[];
  fileRefs: React.MutableRefObject<Record<string, HTMLDivElement>>;
  renamingPath: string | null;
  onFileClick: (e: React.MouseEvent, file: FileEntry) => void;
  onOpen: (file: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, file: FileEntry) => void;
  onRenameSubmit: (file: FileEntry, newName: string) => void;
  onFileNameClick: (e: React.MouseEvent, file: FileEntry) => void;
  operationStatus: Record<string, OperationStatus>;
  setRenamingPath: (path: string | null) => void;
  searchTerm: string;
  searchRegex: boolean;
};

const FileListView: React.FC<Props> = ({
  files,
  selected,
  fileRefs,
  renamingPath,
  onFileClick,
  onOpen,
  onContextMenu,
  onRenameSubmit,
  onFileNameClick,
  operationStatus,
  setRenamingPath,
  searchTerm,
  searchRegex
}) => {
  const safeSelected = Array.isArray(selected) ? selected : [];

  const renderHighlightedName = (name: string) => {
    const keyword = (searchTerm || '').trim();
    if (!keyword) return name;
    try {
      if (searchRegex) {
        const re = new RegExp(keyword, 'ig');
        const parts: React.ReactNode[] = [];
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = re.exec(name)) !== null) {
          const start = match.index;
          const end = start + match[0].length;
          if (start > lastIndex) {
            parts.push(name.slice(lastIndex, start));
          }
          parts.push(
            <mark className="search-hit" key={`${start}-${end}`}>
              {name.slice(start, end)}
            </mark>
          );
          lastIndex = end;
          if (match[0].length === 0) break;
        }
        if (lastIndex < name.length) {
          parts.push(name.slice(lastIndex));
        }
        return parts.length ? parts : name;
      }
      const lower = name.toLowerCase();
      const target = keyword.toLowerCase();
      const idx = lower.indexOf(target);
      if (idx === -1) return name;
      const before = name.slice(0, idx);
      const hit = name.slice(idx, idx + target.length);
      const after = name.slice(idx + target.length);
      return (
        <>
          {before}
          <mark className="search-hit">{hit}</mark>
          {after}
        </>
      );
    } catch {
      return name;
    }
  };
  const [colWidths, setColWidths] = useState({
    name: 320,
    modified: 180,
    custom: 180,
    level: 140
  });
  const resizingRef = useRef<{
    key: 'name' | 'modified' | 'custom' | 'level';
    startX: number;
    startWidth: number;
  } | null>(null);

  const minWidths = {
    name: 200,
    modified: 140,
    custom: 140,
    level: 110
  };

  const handleResizeStart = (
    key: 'name' | 'modified' | 'custom' | 'level',
    e: React.MouseEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = {
      key,
      startX: e.clientX,
      startWidth: colWidths[key]
    };
    document.body.style.cursor = 'col-resize';
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const { key, startX, startWidth } = resizingRef.current;
      const delta = e.clientX - startX;
      const next = Math.max(minWidths[key], startWidth + delta);
      setColWidths((prev) => ({ ...prev, [key]: next }));
    };

    const handleUp = () => {
      if (resizingRef.current) {
        resizingRef.current = null;
        document.body.style.cursor = '';
      }
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [minWidths]);

  return (
    <>
      <div className="list-header">
        <div className="list-header-cell list-header-name" style={{ width: colWidths.name }}>
          名称
          <span
            className="column-resizer"
            onMouseDown={(e) => handleResizeStart('name', e)}
          />
        </div>
        <div className="list-header-cell list-header-date" style={{ width: colWidths.modified }}>
          修改日期
          <span
            className="column-resizer"
            onMouseDown={(e) => handleResizeStart('modified', e)}
          />
        </div>
        <div className="list-header-cell list-header-date" style={{ width: colWidths.custom }}>
          文件日期
          <span
            className="column-resizer"
            onMouseDown={(e) => handleResizeStart('custom', e)}
          />
        </div>
        <div className="list-header-cell list-header-level" style={{ width: colWidths.level }}>
          等级
          <span
            className="column-resizer"
            onMouseDown={(e) => handleResizeStart('level', e)}
          />
        </div>
      </div>
      {files.map((file) => (
        <div
          key={file.relativePath}
          ref={(el) => {
            if (el) fileRefs.current[file.relativePath] = el;
          }}
          className={`list-item ${safeSelected.includes(file.relativePath) ? 'selected' : ''}`}
          onClick={(e) => onFileClick(e, file)}
          onDoubleClick={() => onOpen(file)}
          onContextMenu={(e) => onContextMenu(e, file)}
        >
          <div className="list-item-cell list-item-name" style={{ width: colWidths.name }}>
            <Flex align="center" gap={8}>
              {file.isDirectory ? (
                <FolderOpenOutlined />
              ) : (
                <FileIcon fullPath={file.fullPath} size="small" ext={file.ext} />
              )}
              {renamingPath === file.relativePath ? (
                <Input
                  defaultValue={file.name}
                  autoFocus
                  spellCheck={false}
                  onFocus={(e) => {
                    const val = e.target.value;
                    const dot = val.lastIndexOf('.');
                    const end = dot > 0 ? dot : val.length;
                    // 选中不含扩展名
                    e.target.setSelectionRange(0, end);
                  }}
                  onBlur={(e) => onRenameSubmit(file, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onRenameSubmit(file, (e.target as HTMLInputElement).value);
                    } else if (e.key === 'Escape') {
                      setRenamingPath(null);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{ flex: 1 }}
                />
              ) : (
                <span onClick={(e) => onFileNameClick(e, file)}>
                  {renderHighlightedName(file.name)}
                </span>
              )}
            </Flex>
          </div>
          <div className="list-item-cell list-item-date" style={{ width: colWidths.modified }}>
            {formatTime(file.modified)}
          </div>
          <div className="list-item-cell list-item-date" style={{ width: colWidths.custom }}>
            {file.customTime ? formatTime(Date.parse(file.customTime)) : formatTime(file.created)}
          </div>
          <div className="list-item-cell list-item-level" style={{ width: colWidths.level }}>
            <div className="list-item-tags">
              <Tag color={levelTagMeta(file.levelTag).color}>
                {levelTagMeta(file.levelTag).label}
              </Tag>
              {operationStatus[file.fullPath] && (
                <Tag color="processing">
                  {operationStatus[file.fullPath].operation}...
                </Tag>
              )}
            </div>
          </div>
        </div>
      ))}
    </>
  );
};

export default FileListView;
