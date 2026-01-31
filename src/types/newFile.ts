export interface NewFileType {
  extension: string;
  name: string;
  iconPath: string;
  templatePath: string | null;
  data?: string | null;
}
