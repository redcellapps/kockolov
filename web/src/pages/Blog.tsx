import { useQuery } from '@tanstack/react-query';
import type { MouseEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, ChevronRight, ClockIcon } from '../components/icons';
import { SearchBox } from '../components/SearchBox';
import { EmptyState, ErrorState, Skeleton, buttonClasses, cx } from '../components/ui';
import { t, tn } from '../i18n';
import { api, ApiError, type BlogPost, type BlogSummary } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePageTitle } from '../lib/title';

/** "2. oktobar 2026." (dates are YYYY-MM-DD, read at noon so no time zone moves them) */
const blogDate = (d: string) =>
  new Intl.DateTimeFormat('sr-Latn-RS', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${d}T12:00:00`));

function Meta({ post, className }: { post: BlogSummary; className?: string }) {
  return (
    <p className={cx('flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold', className)}>
      <time dateTime={post.date}>{blogDate(post.date)}</time>
      <span aria-hidden>·</span>
      <span className="inline-flex items-center gap-1">
        <ClockIcon size={15} /> {tn('blog.minutes', post.minutes)}
      </span>
    </p>
  );
}

/** The post's picture as a print with the site's black outline and hard shadow */
function Cover({ post, className, eager }: { post: BlogSummary; className?: string; eager?: boolean }) {
  if (!post.image) return null;
  return (
    <img
      src={post.image.url}
      alt={post.image.alt}
      width={post.image.width}
      height={post.image.height}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : undefined}
      className={cx('h-auto w-full rounded-3xl border-2 border-hero-ink bg-hero-paper shadow-[6px_6px_0_0_var(--hero-ink)]', className)}
    />
  );
}

// ---- /blog ----
export function BlogListPage() {
  usePageTitle(t('title.blog'));
  const q = useQuery({ queryKey: ['blog'], queryFn: () => api<{ items: BlogSummary[] }>('/api/blog') });
  const [first, ...rest] = q.data?.items ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="max-w-2xl">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{t('blog.title')}</h1>
        <p className="mt-3 text-lg text-ink-2">{t('blog.subtitle')}</p>
      </header>

      {q.isLoading && <Skeleton className="mt-10 h-96" />}
      {q.isError && (
        <div className="mt-10">
          <ErrorState onRetry={() => q.refetch()} />
        </div>
      )}
      {q.data && !first && (
        <div className="mt-10">
          <EmptyState title={t('blog.empty')} />
        </div>
      )}

      {first && (
        <Link
          to={`/blog/${first.slug}`}
          className="group mt-10 grid items-center gap-8 rounded-3xl border border-line bg-surface p-5 shadow transition hover:shadow-lg sm:p-8 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:gap-12"
        >
          <div className="min-w-0 md:order-2">
            <Cover post={first} className="mx-auto max-w-sm rotate-[1.5deg] transition group-hover:rotate-0" eager />
          </div>
          <div className="min-w-0 md:order-1">
            <Meta post={first} className="text-ink-3" />
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">{first.title}</h2>
            <p className="mt-4 text-lg leading-relaxed text-ink-2">{first.description}</p>
            <span className="mt-6 inline-flex items-center gap-1 font-bold underline decoration-brand decoration-[3px] underline-offset-4 group-hover:decoration-current">
              {t('blog.read')} <ChevronRight size={18} />
            </span>
          </div>
        </Link>
      )}

      {rest.length > 0 && (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((p) => (
            <Link key={p.slug} to={`/blog/${p.slug}`} className="group flex flex-col rounded-3xl border border-line bg-surface p-4 shadow transition hover:shadow-lg">
              {p.image && (
                <img
                  src={p.image.url}
                  alt={p.image.alt}
                  loading="lazy"
                  className="aspect-[4/3] w-full rounded-2xl object-cover object-top"
                />
              )}
              <Meta post={p} className="mt-4 text-ink-3" />
              <h2 className="mt-2 text-xl font-extrabold tracking-tight text-balance">{p.title}</h2>
              <p className="mt-2 line-clamp-3 text-ink-2">{p.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- /blog/:slug ----
export function BlogPostPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ['blog', slug],
    queryFn: () => api<BlogPost>(`/api/blog/${encodeURIComponent(slug)}`),
    retry: (n, err) => !(err instanceof ApiError && err.status === 404) && n < 2,
  });
  usePageTitle(q.data?.title ?? t('title.blog'));

  // links to other Kockolov pages inside the article open in the app, without a reload
  const onArticleClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a');
    const href = a?.getAttribute('href');
    if (!a || !href?.startsWith('/') || a.target || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(href);
  };

  if (q.isError) {
    const missing = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        {missing ? (
          <EmptyState
            title={t('blog.notFound')}
            action={
              <Link to="/blog" className={buttonClasses('dark', 'md')}>
                {t('blog.all')}
              </Link>
            }
          />
        ) : (
          <ErrorState onRetry={() => q.refetch()} />
        )}
      </div>
    );
  }

  const post = q.data;
  return (
    <article>
      <header className="hero hero-bg relative isolate overflow-hidden border-b border-hero-ink/10 text-hero-ink">
        <div className="hero-studs absolute inset-0 -z-10" aria-hidden />
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-8 pb-12 sm:px-6 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-16 lg:pb-16">
          <div className="min-w-0">
            <Link to="/blog" className="inline-flex items-center gap-1.5 rounded-full bg-hero-ink px-3 py-1 text-xs font-bold tracking-wider text-brand uppercase">
              <ArrowLeft size={14} /> {t('blog.label')}
            </Link>
            {post ? (
              <>
                <h1 className="mt-5 text-[2.125rem] leading-[1.05] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-[3.4rem]">{post.title}</h1>
                <div className="mt-6 flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-hero-ink text-lg font-extrabold text-brand" aria-hidden>
                    {post.author.charAt(0)}
                  </span>
                  <div>
                    <div className="font-extrabold">{post.author}</div>
                    <Meta post={post} className="text-hero-ink/70" />
                  </div>
                </div>
              </>
            ) : (
              <>
                <Skeleton className="mt-5 h-28 max-w-xl bg-hero-ink/10" />
                <Skeleton className="mt-6 h-11 w-60 bg-hero-ink/10" />
              </>
            )}
          </div>
          <div className="mx-auto w-full max-w-[19rem] sm:max-w-[23rem]">
            {post ? <Cover post={post} className="rotate-[1.5deg] sm:rotate-[2deg]" eager /> : <Skeleton className="aspect-[4/5] w-full bg-hero-ink/10" />}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[42rem] px-4 pt-10 pb-4 sm:px-6 sm:pt-14">
        {post ? (
          // the article comes from our own Markdown files, rendered on the server
          <div className="article" onClick={onArticleClick} dangerouslySetInnerHTML={{ __html: post.html }} />
        ) : (
          <div className="space-y-4">
            <Skeleton className="h-6" />
            <Skeleton className="h-6 w-11/12" />
            <Skeleton className="h-6 w-4/5" />
          </div>
        )}
      </div>

      {post && (
        <aside className="mx-auto mt-10 max-w-3xl px-4 sm:px-6">
          <div className="hero hero-bg relative isolate overflow-hidden rounded-3xl border-2 border-hero-ink p-6 text-hero-ink shadow-[6px_6px_0_0_var(--hero-ink)] sm:p-8">
            <div className="hero-studs absolute inset-0 -z-10" aria-hidden />
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{t('blog.cta.title')}</h2>
            <p className="mt-2 max-w-xl text-hero-ink/80">{t('blog.cta.text')}</p>
            <SearchBox size="lg" className="mt-5" />
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold">
              <Link to="/ponude" className="underline decoration-2 underline-offset-4">
                {t('blog.cta.deals')}
              </Link>
              {!user && (
                <Link to="/registracija" className="underline decoration-2 underline-offset-4">
                  {t('blog.cta.signup')}
                </Link>
              )}
            </div>
          </div>
          <p className="mt-8 text-center">
            <Link to="/blog" className="inline-flex items-center gap-1.5 font-bold text-ink-2 hover:text-ink">
              <ArrowLeft size={16} /> {t('blog.all')}
            </Link>
          </p>
        </aside>
      )}
    </article>
  );
}
