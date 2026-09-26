/**
 * AppErrorBoundary - catches render-time crashes anywhere in the tree so a
 * single bad API payload shows a recovery screen instead of a blank page.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
        <p className="font-mono text-sm uppercase tracking-widest text-primary">Signal lost</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Something went wrong while loading this screen. Your data is safe.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    );
  }
}
