import { Component } from 'react';
import { ArrowCounterClockwise as RotateCcw } from '@phosphor-icons/react';

export class ErrorPanel extends Component {
  state = { error: null, errorId: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) {
    console.error('Unhandled Synqra runtime error:', error);
    this.setState({ errorId: `${Date.now().toString(36)}-${Math.floor(Math.random() * 1296).toString(36)}` });
  }
  retry = () => this.setState({ error: null, errorId: null });
  goBack = () => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = window.location.pathname;
  };
  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.compact) {
      return (
        <div className="section-error" role="alert">
          <strong>Something went wrong</strong>
          <p>We couldn&apos;t load this section. Your saved data is safe.</p>
          <div className="section-error-actions"><button className="secondary-button" onClick={this.retry}>Try again</button><button className="text-button" onClick={this.goBack}>Go back</button></div>
          {this.state.errorId && <small>Error ID: {this.state.errorId}</small>}
          {this.state.error && <code className="error-runtime-message">{String(this.state.error.message || this.state.error)}</code>}
          {this.state.error && <details className="error-details"><summary>Details</summary><code>{String(this.state.error.message || this.state.error)}</code></details>}
        </div>
      );
    }
    return (
      <div className="auth-shell">
        <section className="auth-card" style={{ maxWidth: 520, textAlign: 'left' }}>
          <div className="auth-brand" style={{ justifyContent: 'flex-start' }}>
            <img className="synqra-logo auth-logo" src="/logo-synqra.png" alt="Synqra" />
          </div>
          <h1 style={{ fontSize: 22, marginTop: 16 }}>Something went wrong</h1>
          <p style={{ color: '#687a92', fontSize: 13, lineHeight: 1.5 }}>
            We couldn&apos;t load this workspace. Your saved data is safe. Try again or return to the previous page.
          </p>
          {this.state.errorId && <p style={{ color: '#9aa6b5', fontSize: 11 }}>Error ID: {this.state.errorId}</p>}
          {this.state.error && <details style={{ margin: '0 0 16px' }}><summary style={{ fontSize: 12, color: '#687a92', cursor: 'pointer' }}>Details</summary><code style={{ display: 'block', marginTop: 6, fontSize: 11, color: '#b91c1c', wordBreak: 'break-word' }}>{String(this.state.error.message || this.state.error)}</code></details>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="primary-button" onClick={this.retry}>
              <RotateCcw size={15} /> Try again
            </button>
            <button className="secondary-button" onClick={this.goBack}>
              Go back
            </button>
          </div>
        </section>
      </div>
    );
  }
}
