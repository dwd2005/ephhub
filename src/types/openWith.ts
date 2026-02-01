export interface OpenWithApp {
  name: string;
  command: string;
  iconPath: string;
  displayName: string;
  isDefault?: boolean;
  lastUsed?: number | null;
}
