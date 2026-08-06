import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Clips Studio 渲染异常", error, info.componentStack);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="errorBoundary" role="alert">
        <p className="eyebrow">出现异常</p>
        <h2>工作台渲染失败</h2>
        <p>
          {this.state.error.message ||
            "页面渲染时发生未预期错误。你的草稿与配置仍保存在本机，可以安全重载。"}
        </p>
        <div className="buttonGroup">
          <button type="button" className="primaryButton" onClick={() => window.location.reload()}>
            重新加载
          </button>
          <button
            type="button"
            className="secondaryButton"
            onClick={() => this.setState({ error: null })}
          >
            重试渲染
          </button>
        </div>
      </div>
    );
  }
}
