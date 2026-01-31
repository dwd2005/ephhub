type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string };

type LevelTag = 'temp' | 'normal' | 'important' | null;

type ViewMode = 'physical' | 'time';
type DisplayMode = 'list' | 'thumbnail';

interface ClipboardState {
  mode: 'copy' | 'cut';
  rootId: string;
  paths: string[];
}

interface OpenWithApp {
  name: string;
  command: string;
  iconPath: string;
  displayName: string;
}

interface RootItem {
  id: string;
  name: string;
  path: string;
}

interface FileEntry {
  name: string;
  fullPath: string;
  relativePath: string;
  isDirectory: boolean;
  size: number;
  modified: number;
  created: number;
  ext: string;
  type: 'dir' | 'file';
  levelTag: LevelTag;
  customTime: string | null;
}

interface OperationStatus {
  path: string;
  operation: string;
}

interface MessageItem {
  id: number;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  duration?: number;
}

interface TimeBucket {
  fullPath: string;
  relativePath: string;
  time: number | null;
}

interface Window {
  api: {
    chooseRoot: () => Promise<ApiResult<string | null> | string | null>;
    chooseFiles: () => Promise<ApiResult<string[]> | string[]>;
    getConfig: () => Promise<ApiResult<{ roots: RootItem[]; lastRootId: string | null }>>;
    addRoot: (payload: { name: string; path: string }) => Promise<ApiResult<RootItem>>;
    removeRoot: (payload: { id: string }) => Promise<ApiResult<string | null>>;
    renameRoot: (payload: { id: string; name: string }) => Promise<ApiResult<RootItem>>;
    list: (payload: { rootId: string; relativePath: string }) => Promise<ApiResult<FileEntry[]>>;
    timeBuckets: (payload: { rootId: string }) => Promise<ApiResult<TimeBucket[]>>;
    createFolder: (payload: { rootId: string; relativePath: string; name: string }) => Promise<ApiResult<string>>;
    createFile: (payload: { rootId: string; relativePath: string; name: string; templatePath?: string; content?: string }) => Promise<ApiResult<string>>;
    upload: (payload: { rootId: string; relativePath: string; files: string[] }) => Promise<ApiResult<string[]>>;
    pasteFromClipboard: (payload: { rootId: string; relativePath: string }) => Promise<ApiResult<{ from: string; to: string; finalName: string }[]>>;
    getClipboardFiles: () => Promise<ApiResult<string[]>>;
    cleanTemp: (payload: { rootId: string; targets?: string[]; basePath?: string }) => Promise<ApiResult<boolean>>;
    rename: (payload: { rootId: string; relativePath: string; name: string }) => Promise<ApiResult<string>>;
    delete: (payload: { rootId: string; targets: string[] }) => Promise<ApiResult<string[]>>;
    move: (payload: { rootId: string; targets: string[]; destination: string }) => Promise<ApiResult<{ from: string; to: string }[]>>;
    copy: (payload: { rootId: string; targets: string[]; destination: string }) => Promise<ApiResult<{ from: string; to: string }[]>>;
    deleteByLevel: (payload: { rootId: string; levelTag: LevelTag }) => Promise<ApiResult<string[]>>;
    setLevel: (payload: { rootId: string; targets: string[]; levelTag: LevelTag }) => Promise<ApiResult<boolean>>;
    setCustomTime: (payload: { rootId: string; targets: string[]; customTime: string | null }) => Promise<ApiResult<boolean>>;
    getOpenWithApps: (payload: { filePath: string }) => Promise<ApiResult<OpenWithApp[]>>;
    getNewFileTypes: () => Promise<ApiResult<NewFileType[]>>;
    openWithApp: (payload: { command: string; filePath: string }) => Promise<ApiResult<boolean>>;
    openWithDialog: (payload: { filePath: string }) => Promise<ApiResult<boolean>>;
    openItem: (payload: { rootId: string; relativePath: string }) => Promise<ApiResult<string>>;
    revealItem: (payload: { rootId: string; relativePath: string }) => Promise<ApiResult<boolean>>;
    onFsChange: (callback: (payload: { rootId: string; type: string; path: string }) => void) => void;
    onOperationStart: (callback: (payload: OperationStatus) => void) => void;
    onOperationEnd: (callback: (payload: { path: string }) => void) => void;
    windowMinimize: () => Promise<any>;
    windowToggleMaximize: () => Promise<any>;
    windowClose: () => Promise<any>;
  };
}
