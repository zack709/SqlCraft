import React from "react";

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches unexpected React render errors so the window displays diagnostic
 * details and a recovery action instead of turning completely blank.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#f5f6f8] p-6 text-[#1f2329] select-text">
          <div className="w-full max-w-lg rounded-xl border border-[#d4d8e0] bg-white p-5 shadow-lg space-y-3">
            <h2 className="text-sm font-semibold text-[#dc2626]">
              SqlCraft 畫面渲染發生錯誤
            </h2>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-3 font-mono text-xs text-[#334155]">
              {this.state.error.message}
            </pre>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-lg bg-[#2563eb] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1d4ed8]"
              >
                重新載入視窗
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
