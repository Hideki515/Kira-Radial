import { Component, type ErrorInfo, type ReactNode } from "react";
import { perfLog } from "./perf";

interface Props {
  /** Origem no log ("settings", "radial", "orb"). */
  source: string;
  children: ReactNode;
  /** Visual mínimo (ex.: janela do menu/ícone, que são transparentes). */
  compact?: boolean;
}

interface State {
  error: Error | null;
}

/**
 * Em vez de tela branca quando um componente quebra: registra o erro no log e mostra
 * "Algo deu errado" com um botão para recarregar a janela.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    perfLog(`erro na interface: ${error.message}${info.componentStack ? ` | ${info.componentStack.trim().split("\n")[0]}` : ""}`, "error", this.props.source);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className={`error-fallback${this.props.compact ? " is-compact" : ""}`} role="alert">
        <strong>Algo deu errado.</strong>
        {!this.props.compact && <span className="error-detail">{error.message}</span>}
        <span className="error-hint">O erro foi registrado no log (Configurações → Diagnóstico).</span>
        <button type="button" className="btn" onClick={() => location.reload()}>Recarregar</button>
      </div>
    );
  }
}
