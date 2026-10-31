export type Tab = "home" | "journal" | "goals";

export interface ToastState {
  id: number;
  message: string;
  tone: "success" | "error" | "info";
}
