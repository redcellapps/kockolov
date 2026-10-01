import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../i18n';
import { buttonClasses } from './ui';

interface Props {
  children: ReactNode;
  /** Clears the error when it changes (the page path), so navigating away recovers. */
  resetKey?: string;
}

/** Shows a message with a reload button instead of an empty page when rendering crashes. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Kockolov] page crashed', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="text-lg font-bold text-ink">{t('common.crash')}</p>
        <button type="button" onClick={() => window.location.reload()} className={buttonClasses('primary', 'md', 'mt-6')}>
          {t('common.reload')}
        </button>
      </div>
    );
  }
}
