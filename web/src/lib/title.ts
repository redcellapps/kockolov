import { useEffect } from 'react';
import { t } from '../i18n';

/**
 * The browser tab title for the current page, "<title> | Kockolov". Matches what the server puts
 * in the HTML for the first visit, so it stays right while moving around the app.
 */
export function usePageTitle(title?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} | Kockolov` : t('title.default');
  }, [title]);
}
