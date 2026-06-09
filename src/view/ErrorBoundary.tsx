import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

const FALLBACK_STYLE: React.CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  height: '100%',
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div role="alert" style={FALLBACK_STYLE}>
          <div>
            <p>Something went wrong rendering the cube.</p>
            <pre>{this.state.error.message}</pre>
            <button onClick={this.handleReset}>Try again</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
