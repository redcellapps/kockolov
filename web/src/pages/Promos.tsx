import { PromoCard } from '../components/PromoCard';
import { EmptyState, ErrorState, Skeleton } from '../components/ui';
import { t } from '../i18n';
import { usePromos } from '../lib/promos';
import { usePageTitle } from '../lib/title';

export default function PromosPage() {
  usePageTitle(t('promo.title'));
  const q = usePromos();
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-3xl font-extrabold tracking-tight">{t('promo.title')}</h1>
      <p className="mt-2 max-w-2xl text-ink-2">{t('promo.lead')}</p>
      <div className="mt-6">
        {q.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : q.isError ? (
          <ErrorState />
        ) : q.data?.items.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {q.data.items.map((p) => (
              <PromoCard key={p.id} p={p} />
            ))}
          </div>
        ) : (
          <EmptyState title={t('promo.empty')} />
        )}
      </div>
    </div>
  );
}
