import { create } from 'zustand';

type Store = {
  roots: RootItem[];
  currentRootId: string | null;
  currentPath: string;
  tabs: { id: string; title: string; rootId: string; path: string }[];
  viewMode: ViewMode;
  displayMode: DisplayMode;
  files: FileEntry[];
  timeBuckets: TimeBucket[];
  selected: string[];
  clipboard: ClipboardState | null;
  messages: MessageItem[];
  operationStatus: Record<string, OperationStatus>;
  renamingPath: string | null;
  selectionBox: { x: number; y: number; width: number; height: number } | null;
  isDragging: boolean;
  setRoots: (roots: RootItem[], lastRootId: string | null) => void;
  setCurrentRootId: (id: string | null) => void;
  setCurrentPath: (path: string) => void;
  setFiles: (files: FileEntry[]) => void;
  setTimeBuckets: (data: TimeBucket[]) => void;
  setViewMode: (mode: ViewMode) => void;
  setDisplayMode: (mode: DisplayMode) => void;
  setSelected: (paths: string[]) => void;
  selectSingle: (path: string) => void;
  toggleSelect: (path: string) => void;
  clearSelection: () => void;
  setClipboard: (payload: ClipboardState | null) => void;
  setRenamingPath: (path: string | null) => void;
  setSelectionBox: (box: { x: number; y: number; width: number; height: number } | null) => void;
  setIsDragging: (isDragging: boolean) => void;
  addMessage: (payload: Omit<MessageItem, 'id'>) => void;
  removeMessage: (id: number) => void;
  setOperation: (op: OperationStatus) => void;
  clearOperation: (path: string) => void;
  addTab: (tab: { rootId: string; path: string; title?: string }) => void;
  closeTab: (id: string) => void;
  activateTab: (id: string) => void;
  updateTab: (id: string, patch: Partial<{ path: string; title: string; rootId: string }>) => void;
  reorderTabs: (fromId: string, toId: string) => void;
};

export const useStore = create<Store>((set) => ({
  roots: [],
  currentRootId: null,
  currentPath: '.',
  tabs: [],
  viewMode: 'physical',
  displayMode: 'list',
  files: [],
  timeBuckets: [],
  selected: [],
  clipboard: null,
  messages: [],
  operationStatus: {},
  renamingPath: null,
  selectionBox: null,
  isDragging: false,

  setRoots: (roots, lastRootId) =>
    set(() => ({
      roots,
      currentRootId: lastRootId || roots[0]?.id || null
    })),
  setCurrentRootId: (id) => set({ currentRootId: id, currentPath: '.' }),
  setCurrentPath: (path) => set({ currentPath: path }),
  setFiles: (files) => set({ files }),
  setTimeBuckets: (data) => set({ timeBuckets: data }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setDisplayMode: (mode) => set({ displayMode: mode }),
  setSelected: (paths) => set({ selected: paths }),
  selectSingle: (path) => set({ selected: [path] }),
  toggleSelect: (path) =>
    set((state) => {
      const exists = state.selected.includes(path);
      const next = exists
        ? state.selected.filter((p) => p !== path)
        : [...state.selected, path];
      return { selected: next };
    }),
  clearSelection: () => set({ selected: [], renamingPath: null }),
  setClipboard: (payload) => set({ clipboard: payload }),
  setRenamingPath: (path) => set({ renamingPath: path }),
  setSelectionBox: (box) => set({ selectionBox: box }),
  setIsDragging: (isDragging) => set({ isDragging }),

  addMessage: (payload) =>
    set((state) => ({
      messages: [...state.messages, { ...payload, id: Date.now() + Math.floor(Math.random() * 1000) }]
    })),
  removeMessage: (id) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id)
    })),

  setOperation: (op) =>
    set((state) => ({
      operationStatus: { ...state.operationStatus, [op.path]: op }
    })),
  clearOperation: (path) =>
    set((state) => {
      const next = { ...state.operationStatus };
      delete next[path];
      return { operationStatus: next };
    }),
  addTab: (tab) =>
    set((state) => {
      const id = `${Date.now()}-${Math.random()}`;
      const title = tab.title || tab.path || '新标签';
      return {
        tabs: [...state.tabs, { id, title, rootId: tab.rootId, path: tab.path }],
        currentRootId: tab.rootId,
        currentPath: tab.path
      };
    }),
  closeTab: (id) =>
    set((state) => {
      const nextTabs = state.tabs.filter((t) => t.id !== id);
      const active = nextTabs[nextTabs.length - 1];
      return {
        tabs: nextTabs,
        currentRootId: active ? active.rootId : state.currentRootId,
        currentPath: active ? active.path : state.currentPath
      };
    }),
  activateTab: (id) =>
    set((state) => {
      const target = state.tabs.find((t) => t.id === id);
      if (!target) return {};
      return { currentRootId: target.rootId, currentPath: target.path };
    }),
  updateTab: (id, patch) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t))
    })),
  reorderTabs: (fromId, toId) =>
    set((state) => {
      const fromIndex = state.tabs.findIndex((t) => t.id === fromId);
      const toIndex = state.tabs.findIndex((t) => t.id === toId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return {};
      const nextTabs = [...state.tabs];
      const [moved] = nextTabs.splice(fromIndex, 1);
      nextTabs.splice(toIndex, 0, moved);
      return { tabs: nextTabs };
    })
}));
