import {
  Activity, AppWindow, Calculator, Camera, Circle, Code, FileText, FolderOpen, Github, Globe, Headphones,
  Lock, Monitor, Moon, Music, NotebookPen, Play, Server, Settings, SkipBack, SkipForward,
  SlidersHorizontal, Speaker, Terminal, Volume1, Volume2, VolumeX,
  type LucideIcon,
} from "lucide-react";

// Registro curado de ícones (o seletor de ícones da tela de configuração lista estes nomes).
export const ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  "app-window": AppWindow,
  calculator: Calculator,
  camera: Camera,
  code: Code,
  "file-text": FileText,
  "folder-open": FolderOpen,
  github: Github,
  globe: Globe,
  headphones: Headphones,
  lock: Lock,
  monitor: Monitor,
  moon: Moon,
  music: Music,
  "notebook-pen": NotebookPen,
  play: Play,
  server: Server,
  settings: Settings,
  "skip-back": SkipBack,
  "skip-forward": SkipForward,
  "sliders-horizontal": SlidersHorizontal,
  speaker: Speaker,
  terminal: Terminal,
  "volume-1": Volume1,
  "volume-2": Volume2,
  "volume-x": VolumeX,
};

export function getIcon(name: string): LucideIcon {
  return ICONS[name] ?? Circle;
}
