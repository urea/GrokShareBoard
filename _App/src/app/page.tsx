
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import ShareInput from '@/components/ShareInput';
import VideoCard from '@/components/VideoCard';
import { Search, FileText, History, ShieldCheck, ShieldAlert, ExternalLink, Copy, ChevronLeft, ChevronRight, LifeBuoy, Share2, RefreshCw, Clapperboard } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Post, PostPromptSource, PostSearchRow } from '@/types';
import NsfwWarningModal from '@/components/NsfwWarningModal';
import AffiliateBanner from '@/components/AffiliateBanner';
import CommentSection from '@/components/CommentSection';
import { createPortal } from 'react-dom';

function ModalPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

function getPromptStatusMessage(status: string | null | undefined, targetLabel = 'Grok元プロンプト') {
  switch (status || 'pending') {
    case 'no_prompt':
      return `${targetLabel}はありません。`;
    case 'source_missing':
      return 'Grok側で投稿またはメディアが見つからないため、プロンプトを取得できません。';
    case 'access_denied':
      return 'Grok側で公開化されていないため、プロンプトを取得できません。Grokで「シェア」または「Xに投稿」を押すと、次回の自動取得で反映される場合があります。';
    case 'failed':
      return `${targetLabel}を取得できませんでした。`;
    default:
      return `${targetLabel}は取得待ちです。取得には時間がかかる場合があります。`;
  }
}

function toPosts(rows: PostSearchRow[]): Post[] {
  return rows.map((row) => {
    const post = { ...row } as Partial<PostSearchRow>;
    delete post.source_prompt_text;
    return post as Post;
  });
}

async function copyTextToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (!copied) throw new Error('Clipboard write was blocked.');
  }
}

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [sortBy, setSortBy] = useState<'newest' | 'popular' | 'views' | 'comment'>('newest');
  const [showNsfw, setShowNsfw] = useState(false);
  const [showNsfwConfirm, setShowNsfwConfirm] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminClickCount, setAdminClickCount] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  // activeVideoPostId は廃止済み（詳細モーダルに統合）。互換性のため残さず完全削除。
  const [activePromptPostId, setActivePromptPostId] = useState<string | null>(null);
  const [videoError, setVideoError] = useState(false);
  const [promptRetryingPostId, setPromptRetryingPostId] = useState<string | null>(null);
  const [promptSourcesByPostId, setPromptSourcesByPostId] = useState<Record<string, PostPromptSource[]>>({});
  const [promptSourcesLoadingPostId, setPromptSourcesLoadingPostId] = useState<string | null>(null);
  const [copiedPromptKey, setCopiedPromptKey] = useState<string | null>(null);
  // URLパラメータ（?postId=XXX）経由で直接開かれた投稿データを保持するステート
  // 一覧（posts）に含まれない投稿でも詳細モーダルを表示可能にするために使用
  const [directPost, setDirectPost] = useState<Post | null>(null);

  // Swipe handling states
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);

  const minSwipeDistance = 50; // Minimum pixel distance required for a swipe

  const POSTS_PER_PAGE = 24;
  const APP_VERSION = 'v1.13.1';

  const fetchPosts = async (pageNumber: number, isNewSearch: boolean = false) => {
    if (loading) return;
    setLoading(true);

    try {
      let query = supabase
        .from('posts_search_index')
        .select('*')
        .range(pageNumber * POSTS_PER_PAGE, (pageNumber + 1) * POSTS_PER_PAGE - 1);

      if (sortBy === 'newest') {
        query = query.order('created_at', { ascending: false });
      } else if (sortBy === 'popular') {
        query = query.order('clicks', { ascending: false });
      } else if (sortBy === 'views') {
        query = query.order('views', { ascending: false })
          .order('created_at', { ascending: false });
      } else if (sortBy === 'comment') {
        // Sort by last_comment_at (fallback to created_at if null)
        // Note: COALESCE sorting might require a raw order string or careful use of .order()
        // Here we use the fact that last_comment_at is meant to be prioritized.
        // For Supabase client, we can use a custom order or multiple orders as fallback.
        query = query.order('last_comment_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false });
      }

      if (!showNsfw) {
        query = query.eq('nsfw', false);
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim();
        query = query.or(`prompt.ilike.%${q}%,description.ilike.%${q}%,user_id.ilike.%${q}%,source_prompt_text.ilike.%${q}%`);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching posts:', error);
      } else {
        const newPosts = toPosts((data || []) as PostSearchRow[]);

        if (isNewSearch || pageNumber === 0) {
          setPosts(newPosts);
        } else {
          setPosts(prev => [...prev, ...newPosts]);
        }

        if (newPosts.length < POSTS_PER_PAGE) {
          setHasMore(false);
        } else {
          setHasMore(true);
        }
      }
    } catch (err) {
      console.error('Unexpected error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Load NSFW preference from localStorage
    const savedNsfw = localStorage.getItem('grok_share_show_nsfw');
    if (savedNsfw === 'true') {
      setShowNsfw(true);
    }
    setIsInitialized(true);

    // === URLパラメータ ?postId=XXX による詳細モーダル自動展開 ===
    // 外部（Xのシェアリンク等）からアクセスされた場合に、該当投稿の詳細画面を即座に表示する。
    // 一覧の読み込み（fetchPosts）とは独立して、指定IDの投稿を直接Supabaseからフェッチする。
    const params = new URLSearchParams(window.location.search);
    const postIdFromUrl = params.get('postId');
    if (postIdFromUrl) {
      (async () => {
        try {
          const { data, error } = await supabase
            .from('posts')
            .select('*')
            .eq('id', postIdFromUrl)
            .single();
          if (data && !error) {
            // 直接フェッチした投稿データを保持し、詳細モーダルを開く
            setDirectPost(data);
            setActivePromptPostId(data.id);
            // URLパラメータ経由でもビューカウントを加算する
            try {
              await supabase.rpc('increment_view', { post_id: data.id });
            } catch (viewErr) {
              console.error('Failed to increment view from URL param:', viewErr);
            }
          }
        } catch (err) {
          console.error('Failed to fetch post from URL parameter:', err);
        }
      })();
    }
  }, []);

  // Consolidated fetch effect for filter/sort changes
  useEffect(() => {
    if (!isInitialized) return;

    localStorage.setItem('grok_share_show_nsfw', showNsfw.toString());
    setPage(0);
    setHasMore(true);
    fetchPosts(0, true);
  }, [showNsfw, sortBy, isInitialized]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    setHasMore(true);
    fetchPosts(0, true);
  };

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPosts(nextPage, false);
  };

  const handleSortChange = (newSort: 'newest' | 'popular' | 'views' | 'comment') => {
    if (newSort === sortBy) return;
    setSortBy(newSort);
  };

  const handleVersionClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // 親（タイトル）への伝播を防ぎリロードを止める
    const newCount = adminClickCount + 1;
    if (newCount >= 5) {
      setIsAdmin(!isAdmin);
      setAdminClickCount(0);
      alert(isAdmin ? '管理者モードを終了しました / Admin Mode Disabled' : '管理者モードが有効になりました / Admin Mode Enabled');
    } else {
      setAdminClickCount(newCount);
      // Reset count after 2 seconds of inactivity
      setTimeout(() => setAdminClickCount(0), 2000);
    }
  };

  // Navigate Modal Functions
  const handleNavigate = async (direction: 1 | -1) => {
    // 詳細モーダルに統合されたため、activePromptPostIdのみで前後移動を管理
    if (activePromptPostId) {
      const currentIndex = posts.findIndex(p => p.id === activePromptPostId);
      if (currentIndex === -1) return;
      const nextIndex = currentIndex + direction;
      if (nextIndex >= 0 && nextIndex < posts.length) {
        const nextPost = posts[nextIndex];
        handleOpenDetails(nextPost);
      }
    }
  };

  // キーボードショートカット (ESCと左右キー)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activePromptPostId) setActivePromptPostId(null);
      } else if (e.key === 'ArrowRight') {
        handleNavigate(1);
      } else if (e.key === 'ArrowLeft') {
        handleNavigate(-1);
      }
    };

    if (activePromptPostId) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activePromptPostId]);

  // ブラウザの戻るボタン対応 (History API)
  useEffect(() => {
    const handlePopState = () => {
      // 戻るボタンが押されたらモーダルを閉じる
      setActivePromptPostId(null);
    };

    window.addEventListener('popstate', handlePopState);

    // モーダルが開いた時に履歴を追加
    if (activePromptPostId) {
      if (window.location.hash !== '#detail') {
        window.history.pushState({ modal: true }, '', '#detail');
      }
    } else {
      // モーダルが閉じていて、かつハッシュが残っている場合は履歴を正常化
      if (window.location.hash === '#detail' || window.location.hash === '#video' || window.location.hash === '#prompt') {
        window.history.replaceState(null, '', window.location.pathname);
      }
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [activePromptPostId]);

  // Swipe event handlers
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEndX(null); // Reset on start
    setTouchStartX(e.targetTouches[0].clientX);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEndX(e.targetTouches[0].clientX);
  };
  const onTouchEnd = () => {
    if (!touchStartX || !touchEndX) return;
    const distance = touchStartX - touchEndX;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      handleNavigate(1); // Swipe left = go to next (right) post
    } else if (isRightSwipe) {
      handleNavigate(-1); // Swipe right = go to prev (left) post
    }
    // Reset after swipe calculation
    setTouchStartX(null);
    setTouchEndX(null);
  };

  // 詳細モーダルを開く統合関数（サムネクリック・詳細ボタン・ナビゲーション共通）
  // ビューカウントの加算もここで一括管理する
  const handleOpenDetails = async (post: Post) => {
    setVideoError(false);
    setActivePromptPostId(post.id);

    // Optimistic update for views in the global list
    const newViews = (post.views || 0) + 1;
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, views: newViews } : p));

    try {
      await supabase.rpc('increment_view', { post_id: post.id });
    } catch (err) {
      console.error('Failed to increment view:', err);
      // Revert optimism if failed
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, views: post.views } : p));
    }
  };

  const handleRequestPromptRetry = async (post: Post) => {
    setPromptRetryingPostId(post.id);
    try {
      const { error } = await supabase
        .from('posts')
        .update({
          prompt_fetch_status: 'pending',
          prompt_fetch_error: null,
          prompt_fetched_at: null,
        })
        .eq('id', post.id);

      if (error) throw error;

      const retryPatch = {
        prompt_fetch_status: 'pending',
        prompt_fetch_error: null,
        prompt_fetched_at: null,
      };
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, ...retryPatch } : p));
      setDirectPost(prev => prev?.id === post.id ? { ...prev, ...retryPatch } : prev);
      setPromptSourcesByPostId(prev => {
        const next = { ...prev };
        delete next[post.id];
        return next;
      });
    } catch (err) {
      console.error('Failed to request prompt retry:', err);
      alert('再取得依頼に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setPromptRetryingPostId(null);
    }
  };
  // activePromptPostは一覧（posts）から探し、見つからなければ直接フェッチした投稿（directPost）を使用する
  // これにより、?postId=XXXで直接アクセスされた場合でも、一覧に該当投稿がなくても詳細モーダルを表示できる
  const activePromptPost = posts.find(p => p.id === activePromptPostId) || (directPost?.id === activePromptPostId ? directPost : undefined);

  useEffect(() => {
    if (!activePromptPostId || promptSourcesByPostId[activePromptPostId]) return;

    let cancelled = false;
    setPromptSourcesLoadingPostId(activePromptPostId);

    (async () => {
      try {
        const { data, error } = await supabase
          .from('post_prompt_sources')
          .select('*')
          .eq('post_id', activePromptPostId)
          .order('depth', { ascending: true });

        if (cancelled) return;
        if (error) {
          console.error('Failed to fetch prompt sources:', error);
          setPromptSourcesByPostId(prev => ({ ...prev, [activePromptPostId]: [] }));
        } else {
          setPromptSourcesByPostId(prev => ({
            ...prev,
            [activePromptPostId]: (data || []) as PostPromptSource[],
          }));
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Unexpected prompt source fetch error:', err);
          setPromptSourcesByPostId(prev => ({ ...prev, [activePromptPostId]: [] }));
        }
      } finally {
        if (!cancelled) setPromptSourcesLoadingPostId(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activePromptPostId, promptSourcesByPostId]);

  const handleCopyPrompt = (key: string, prompt: string) => {
    if (!prompt) return;
    copyTextToClipboard(prompt).then(() => {
      setCopiedPromptKey(key);
      window.setTimeout(() => {
        setCopiedPromptKey(prev => prev === key ? null : prev);
      }, 1600);
    }).catch((err) => {
      console.error('Failed to copy prompt:', err);
    });
  };

  // Helper for generating correct thumbnail string
  const getValidImageUrl = (url: string | null) => {
    if (!url) return '/placeholder.png';
    if (url.includes('imagine-public.x.ai')) {
      if (url.endsWith('_thumbnail.jpg') || url.endsWith('.png') || url.endsWith('.jpg')) return url;
      return url.replace(/(\.mp4|\.png|\.jpg)$/, '') + '_thumbnail.jpg';
    }
    return url;
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-gray-100 font-sans">
      {/* Simple Title Bar (Monsnode style: Blue/Solid) */}
      <header className="bg-[#0099cc] shadow-md">
        <div className="container mx-auto px-3 sm:px-4 h-12 flex items-center justify-between gap-2 overflow-hidden">
          <h1
            className="min-w-0 text-base sm:text-lg font-bold text-white tracking-wide flex items-baseline gap-1.5 sm:gap-2 cursor-pointer select-none"
            onClick={() => window.location.reload()}
            title="ページを再読み込み / Reload API"
          >
            <span className="truncate hover:opacity-80 transition-opacity">GrokShareBoard</span>
            <span 
              className="text-xs font-normal opacity-80 hover:bg-white/10 px-1 rounded cursor-crosshair transition-colors" 
              onClick={handleVersionClick}
              title="Version Info"
            >
              {APP_VERSION}
            </span>
            {isAdmin && (
              <span 
                className="ml-2 text-[10px] bg-white text-blue-600 px-1 rounded animate-pulse uppercase cursor-default"
                onClick={(e) => e.stopPropagation()}
              >
                Admin
              </span>
            )}
          </h1>

          {/* Header Links */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            {/* NSFW Toggle Switch (Segmented Control) */}
            <div className="flex bg-black/20 p-0.5 rounded-full border border-white/10 w-fit shadow-inner">
              <button
                onClick={() => setShowNsfw(false)}
                className={`flex items-center gap-1.5 px-2 sm:px-3 py-1 rounded-full text-[10px] font-bold transition-all ${!showNsfw
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-white/40 hover:text-white/70'
                  }`}
                title="セーフモード / Safe Mode"
              >
                <ShieldCheck size={12} />
                <span className="hidden sm:inline">SAFE</span>
              </button>
              <button
                onClick={() => {
                  if (!showNsfw) {
                    setShowNsfwConfirm(true);
                  } else {
                    setShowNsfw(false);
                  }
                }}
                className={`flex items-center gap-1.5 px-2 sm:px-3 py-1 rounded-full text-[10px] font-bold transition-all ${showNsfw
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-white/40 hover:text-white/70'
                  }`}
                title="NSFW表示ON / NSFW Mode"
              >
                <ShieldAlert size={12} />
                <span className="hidden sm:inline">NSFW</span>
              </button>
            </div>

            <div className="hidden sm:block h-4 w-[1px] bg-white/20 mx-1" />

            <Link
              href="/tools/video-join"
              className="inline-flex items-center gap-1 text-white/80 transition-colors hover:text-white"
              title="Grok動画をブラウザ内で結合"
            >
              <Clapperboard size={20} />
              <span className="hidden lg:inline text-xs font-medium">動画結合</span>
            </Link>

            <div className="hidden min-[420px]:block h-4 w-[1px] bg-white/20 mx-1" />

            <a
              href="https://note.com/limber_lynx1258/n/n700edc6393f1"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/80 hover:text-white transition-colors flex items-center gap-1"
              title="フィードバック・運営支援 (note)"
            >
              <LifeBuoy size={20} className="text-white/60" />
              <span className="hidden lg:inline text-xs font-medium">Feedback</span>
            </a>
            <div className="hidden min-[420px]:block h-4 w-[1px] bg-white/20 mx-1" />
            <a
              href="https://github.com/urea/GrokShareBoard/blob/main/README.md"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden min-[420px]:inline-flex text-white/80 hover:text-white transition-colors"
              title="README"
            >
              <FileText size={20} />
            </a>
            <a
              href="https://github.com/urea/GrokShareBoard/blob/main/CHANGELOG.md"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden min-[420px]:inline-flex text-white/80 hover:text-white transition-colors"
              title="CHANGELOG"
            >
              <History size={20} />
            </a>
          </div>
        </div>
      </header>

      <main className="w-full max-w-[1920px] mx-auto px-2 pt-4">

        {/* Collapsible Post/Guide Area (Compact) */}
        <div className="mb-6">
          <details className="group bg-[#2a2a2a] rounded-md overflow-hidden border border-gray-700 shadow-lg">
            <summary className="cursor-pointer p-3 text-sm font-bold text-gray-200 hover:text-white flex items-center justify-between transition-all bg-[#252525] hover:bg-[#2d2d2d]">
              <div className="flex items-center gap-2">
                <span className="text-lg">📬</span>
                <div className="flex flex-col md:flex-row md:items-center md:gap-2">
                  <span>投稿はこちら・使い方・規約 / Post & Guide</span>
                  {/* <span className="text-gray-400 font-normal text-xs md:text-sm">/ 投稿はこちら・使い方・規約</span> */}
                </div>
              </div>
              <span className="group-open:rotate-180 transition-transform text-gray-500">▼</span>
            </summary>
            <div className="p-4 bg-[#202020] text-gray-300 space-y-6">
              {/* Post Instructions & Form */}
              <section>
                <div className="flex items-center gap-2 mb-3 border-b border-gray-700 pb-2">
                  <h3 className="text-sm font-bold text-white">投稿・ストックする / Share Grok Imagine</h3>
                </div>
                <div className="text-xs text-gray-400 mb-4 space-y-2">
                  <p className="font-bold text-gray-300">プロンプトのアイディア保管庫 兼 おかず倉庫</p>
                  <p>
                    自分が作った作品はもちろん、SNSで見かけた「これ良い！」という他人の作品も、URLを貼るだけで気軽にストック・共有できます。
                    <br />
                    <span className="opacity-70 text-[10px]">You can archive any Grok URL, whether it&apos;s your own work or something great you found on X.</span>
                  </p>
                </div>
                <ShareInput onPostCreated={() => {
                  if (sortBy !== 'newest') {
                    setSortBy('newest');
                  } else {
                    setPage(0);
                    setHasMore(true);
                    fetchPosts(0, true);
                  }
                }} />
              </section>

              {/* Usage Rules */}
              <section className="text-xs space-y-2 border-t border-gray-700 pt-4">
                <h3 className="text-sm font-bold text-gray-300 mb-3 underline decoration-[#0099cc] underline-offset-4">利用規約・方針 / Open Archiving Policy</h3>

                <ul className="list-disc list-inside space-y-2 mb-4 text-gray-400">
                  <li>
                    <span className="text-gray-200 font-bold">自薦・他薦不問 / Open Submission</span>:
                    自分の作品だけでなく、SNS等で見かけたお気に入り作品のURLも歓迎します。
                    <span className="opacity-70 text-[10px] ml-2">(Feel free to share any Grok URLs, including those found on SNS.)</span>
                  </li>
                  <li>
                    <span className="text-gray-200 font-bold">ジャンル制限なし / No Genre Limits</span>:
                    プロンプト研究から「おかず作品」の収集まで。全年齢〜NSFWまであらゆる表現を許容します。
                    <span className="opacity-70 text-[10px] ml-2">(All genres from research to NSFW are allowed.)</span>
                  </li>
                  <li>
                    <span className="text-red-400 font-bold">禁止事項 / Prohibitions</span>:
                    児童ポルノ、犯罪、明白な権利侵害など、法律に抵触する内容は絶対に投稿しないでください。
                    <span className="opacity-70 text-[10px] ml-2">(Illegal content and copyright infringement are strictly prohibited.)</span>
                  </li>
                </ul>

                <div className="bg-blue-900/10 border border-blue-900/30 p-3 rounded text-blue-300/80 mt-4">
                  <p className="font-bold text-blue-400/80 mb-1">編集・削除について / How to Edit or Delete</p>
                  <p className="text-xs">
                    編集・削除したい場合は、再度そのGrok URLを入力して「読み込み」を押してください。
                    <span className="opacity-70 text-[10px] ml-2">(To edit or delete, re-enter the URL and click &quot;Load&quot;.)</span>
                  </p>
                </div>

                <div className="bg-gray-800/40 border border-gray-700 p-3 rounded text-gray-300 mt-4">
                  <p className="font-bold text-gray-200 mb-1 flex items-center gap-2">
                    <LifeBuoy size={14} className="text-[#0099cc]" />
                    フィードバック・運営支援 / Feedback & Support
                  </p>
                  <p className="text-xs leading-relaxed">
                    不具合の報告、新機能のご要望、および運営維持費（サーバー代）へのご支援は note にて一括して受け付けております。
                    <br />
                    <a
                      href="https://note.com/limber_lynx1258/n/n700edc6393f1"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-2 text-[#0099cc] hover:text-[#00aadd] transition-colors font-bold"
                    >
                      公式フィードバック・支援窓口 (note) ➔
                    </a>
                  </p>
                </div>
              </section>
            </div>
          </details>
        </div>

        {/* Affiliate Advertising & Support Banner */}
        <AffiliateBanner />

        {/* Search & Sort Bar */}
        <div className="mb-4 flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Sorting Tabs (Left aligned on Desktop) */}
          <div className="flex bg-[#2a2a2a] p-1 rounded-lg border border-gray-700 shadow-inner w-full md:w-auto">
            <button
              onClick={() => handleSortChange('newest')}
              className={`flex-1 md:flex-none px-4 py-1.5 rounded text-xs font-bold transition-all ${sortBy === 'newest' ? 'bg-[#0099cc] text-white shadow-md' : 'text-gray-400 hover:text-gray-200'}`}
            >
              最新 / Newest
            </button>
            <button
              onClick={() => handleSortChange('popular')}
              className={`flex-1 md:flex-none px-4 py-1.5 rounded text-xs font-bold transition-all ${sortBy === 'popular' ? 'bg-[#0099cc] text-white shadow-md' : 'text-gray-400 hover:text-gray-200'}`}
            >
              人気 / Popular
            </button>
            <button
              onClick={() => handleSortChange('views')}
              className={`flex-1 md:flex-none px-4 py-1.5 rounded text-xs font-bold transition-all ${sortBy === 'views' ? 'bg-[#0099cc] text-white shadow-md' : 'text-gray-400 hover:text-gray-200'}`}
            >
              視聴回数 / Viewed
            </button>
            <button
              onClick={() => handleSortChange('comment')}
              className={`flex-1 md:flex-none px-4 py-1.5 rounded text-xs font-bold transition-all ${sortBy === 'comment' ? 'bg-[#0099cc] text-white shadow-md' : 'text-gray-400 hover:text-gray-200'}`}
            >
              コメント順 / Active
            </button>
          </div>

          <form onSubmit={handleSearch} className="relative w-full max-w-xs flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="検索... / Search prompt, ideas, archives..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#2a2a2a] border border-gray-600 text-sm text-white pl-8 pr-3 py-1.5 rounded focus:ring-1 focus:ring-[#0099cc] outline-none placeholder-gray-500"
              />
              <Search className="absolute left-2.5 top-2 text-gray-500" size={14} />
            </div>
            <button
              type="submit"
              className="bg-[#0099cc] text-white px-3 py-1.5 rounded text-sm font-bold hover:bg-[#0088bb] transition-colors"
            >
              Go
            </button>
          </form>
        </div>

        {/* Standard Grid Layout (Flows Left -> Right) */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 pb-10 mx-auto">
          {posts.length > 0 ? (
            posts.map((post) => (
              <div key={post.id} className="w-full">
                {/* Force compact mode and pass style prop for overlay look */}
                <VideoCard
                  post={post}
                  compact={true}
                  overlayStyle={true}
                  isAdmin={isAdmin}
                  onUpdate={(updatedPost) => {
                    setPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p));
                  }}
                  onDelete={(deletedId) => {
                    setPosts(prev => prev.filter(p => p.id !== deletedId));
                  }}
                  onOpenVideo={() => handleOpenDetails(post)}
                  onOpenDetails={() => handleOpenDetails(post)}
                />
              </div>
            ))
          ) : (
            !loading && (
              <div className="text-center text-gray-500 col-span-full py-20 text-sm">
                No posts found.
              </div>
            )
          )}
        </div>

        {/* Load More Button */}
        <div className="pb-20 text-center">
          {loading && posts.length === 0 ? (
            <div className="text-gray-500 text-sm">Loading...</div>
          ) : hasMore ? (
            <button
              onClick={loadMore}
              disabled={loading}
              className="bg-[#2a2a2a] hover:bg-[#3a3a3a] text-gray-300 px-8 py-3 rounded-full text-sm font-bold transition-colors border border-gray-700 shadow-md"
            >
              {loading ? 'Loading...' : 'もっと読み込む / Load More'}
            </button>
          ) : posts.length > 0 ? (
            <div className="text-gray-600 text-xs">これ以上はありません / No more posts</div>
          ) : null}
        </div>
      </main>

      {/* Global Modals */}

      {/* Full Prompt / Comment Modal */}
      {activePromptPost && (() => {
        const currentIndex = posts.findIndex(p => p.id === activePromptPostId);
        const hasPrev = currentIndex > 0;
        const hasNext = currentIndex < posts.length - 1;
        const currentPrompt = activePromptPost.prompt_fetch_status === 'fetched' && activePromptPost.prompt?.trim()
          ? activePromptPost.prompt
          : '';
        const description = activePromptPost.description?.trim() || '';
        const promptStatus = activePromptPost.prompt_fetch_status || 'pending';
        const promptSources = promptSourcesByPostId[activePromptPost.id] || [];
        const promptSourcesLoading = promptSourcesLoadingPostId === activePromptPost.id;
        const currentPromptLabel = activePromptPost.video_url?.includes('.mp4')
          ? '動画プロンプト / Video Prompt'
          : '画像プロンプト / Image Prompt';
        return (
          <ModalPortal>
            <div
              className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm group"
              onClick={(e) => {
                e.stopPropagation();
                setActivePromptPostId(null);
              }}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              {hasPrev && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleNavigate(-1); }}
                  className="absolute left-2 md:left-10 text-white/40 hover:text-white transition-colors bg-black/40 hover:bg-black/80 rounded-full p-2 z-[10010] scale-75 md:scale-100"
                >
                  <ChevronLeft size={36} />
                </button>
              )}

              <div
                data-testid="post-detail-modal"
                className="bg-gray-900 border border-gray-700 rounded-xl w-[96vw] max-w-[1920px] max-h-[94vh] flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(460px,640px)] overflow-hidden shadow-2xl relative"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Left/Top Section: Media Viewer */}
                <div className="w-full lg:w-auto lg:min-w-0 bg-black flex items-center justify-center relative min-h-[32vh] lg:min-h-0 border-b lg:border-b-0 lg:border-r border-gray-800">
                  {activePromptPost.video_url && activePromptPost.video_url.includes('.mp4') && !videoError ? (
                    <video
                      key={`modal-video-${activePromptPost.id}`}
                      src={activePromptPost.video_url}
                      autoPlay
                      controls
                      className="w-full h-full object-contain max-h-[42vh] lg:max-h-[94vh]"
                      onError={() => setVideoError(true)}
                    />
                  ) : (
                    <img
                      key={`modal-img-${activePromptPost.id}`}
                      src={activePromptPost.image_url ? activePromptPost.image_url.replace('_thumbnail.jpg', '.jpg') : getValidImageUrl(activePromptPost.image_url)}
                      alt={description || currentPrompt || 'Grok generation image'}
                      className="w-full h-full object-contain max-h-[42vh] lg:max-h-[94vh]"
                      onError={(e) => {
                        const displayImage = getValidImageUrl(activePromptPost.image_url);
                        const target = e.currentTarget;
                        if (target.src.endsWith('.jpg') && !target.src.includes('_thumbnail')) {
                          target.src = target.src.replace('.jpg', '.png');
                        } else if (target.src !== displayImage) {
                          target.src = displayImage;
                        }
                      }}
                    />
                  )}
                </div>

                {/* Right/Bottom Section: Info & Comments */}
                <div className="w-full lg:w-auto lg:min-w-[460px] p-4 sm:p-6 overflow-y-auto max-h-[56vh] lg:max-h-[94vh] flex flex-col bg-gray-900">
                  {/* Header Section */}
                  <div className="flex justify-between items-start gap-2 mb-4 shrink-0">
                    <h3 className="text-xs sm:text-sm font-bold text-gray-400 leading-tight pt-1">
                      プロンプト情報<br className="sm:hidden" /><span className="hidden sm:inline"> / Prompts</span>
                    </h3>
                    <div className="flex flex-wrap justify-end gap-1.5 sm:gap-2 items-center">
                      <a
                        href={activePromptPost.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={async () => {
                          try {
                            await supabase.rpc('increment_click', { post_id: activePromptPost.id });
                          } catch { }
                        }}
                        className="flex items-center gap-1 text-[10px] sm:text-xs text-blue-400 hover:text-blue-300 bg-gray-800 hover:bg-gray-700 px-2 sm:px-3 py-1 rounded border border-gray-700 transition-colors whitespace-nowrap"
                      >
                        <ExternalLink size={12} className="sm:w-3.5 sm:h-3.5" /> Grok
                      </a>
                      {/* === 第2段階: Xでシェアするボタン === */}
                      {/* OGPは意図的に設定しない（凍結リスク回避）。テキストとURLのみをXの投稿画面に渡す安全設計。 */}
                      <button
                        onClick={() => {
                          const siteUrl = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname.split('?')[0].replace(/\/$/, '')}` : '';
                          const shareUrl = `${siteUrl}?postId=${activePromptPost.id}`;
                          const shareText = 'GrokShareBoardの投稿をチェック！';
                          const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}&hashtags=GrokShareBoard`;
                          window.open(tweetUrl, '_blank', 'noopener,noreferrer');
                        }}
                        className="flex items-center gap-1 text-[10px] sm:text-xs text-sky-400 hover:text-sky-300 bg-gray-800 hover:bg-gray-700 px-2 sm:px-3 py-1 rounded border border-gray-700 transition-colors whitespace-nowrap"
                        title="この投稿をX（Twitter）でシェア"
                      >
                        <Share2 size={12} className="sm:w-3.5 sm:h-3.5" /> Share
                      </button>
                      <button
                        onClick={() => setActivePromptPostId(null)}
                        className="text-gray-400 hover:text-white p-1 ml-1 sm:ml-2"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4 mb-6">
                    <div data-testid="current-prompt-card" className="rounded-lg border border-gray-800 bg-gray-950/30 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h4 className="text-xs font-bold leading-tight text-gray-300">
                          {currentPromptLabel}
                        </h4>
                        <button
                          data-testid="copy-current-prompt"
                          type="button"
                          onClick={() => handleCopyPrompt(`current-${activePromptPost.id}`, currentPrompt)}
                          disabled={!currentPrompt}
                          className={`inline-flex shrink-0 items-center gap-1 rounded border border-gray-700 px-2 py-1 text-[10px] transition-colors ${currentPrompt
                            ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
                            : 'cursor-not-allowed bg-gray-800/50 text-gray-600'
                            }`}
                        >
                          <Copy size={11} />
                          {copiedPromptKey === `current-${activePromptPost.id}` ? 'OK' : 'Copy'}
                        </button>
                      </div>
                      <p className="text-sm leading-relaxed text-gray-100 whitespace-pre-wrap">
                        {currentPrompt || (
                          <span className="text-gray-500 italic">
                            {getPromptStatusMessage(promptStatus, 'この投稿のプロンプト')}
                          </span>
                        )}
                      </p>

                      {!currentPrompt && promptStatus === 'access_denied' && (
                        <div className="mt-3 rounded-lg border border-blue-900/40 bg-blue-950/20 p-3 text-xs text-blue-100">
                          <button
                            type="button"
                            onClick={() => handleRequestPromptRetry(activePromptPost)}
                            disabled={promptRetryingPostId === activePromptPost.id}
                            title="Grok側で公開化済みの場合のみ、元プロンプトの再取得対象に戻します"
                            className="mb-2 inline-flex items-center gap-1.5 rounded border border-blue-700 bg-blue-900/50 px-3 py-1.5 font-bold text-blue-100 transition-colors hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
                          >
                            <RefreshCw
                              size={13}
                              className={promptRetryingPostId === activePromptPost.id ? 'animate-spin' : ''}
                            />
                            公開化済み・再取得を依頼
                          </button>
                          <p className="leading-relaxed text-blue-200/80">
                            Grok側で「シェア」または「Xに投稿」を押した後に使用してください。次回の自動取得でプロンプトを再確認します。
                          </p>
                        </div>
                      )}
                    </div>

                    {promptSourcesLoading && (
                      <div className="rounded-lg border border-gray-800 bg-gray-950/20 p-3 text-xs text-gray-500">
                        元画像・上位プロンプトを確認しています。
                      </div>
                    )}

                    {!promptSourcesLoading && promptSources.length === 0 && (
                      <div className="rounded-lg border border-gray-800 bg-gray-950/20 p-3 text-xs text-gray-500">
                        元画像・上位プロンプトは未取得、または未検出です。
                      </div>
                    )}

                    {promptSources.map((source) => {
                      const sourcePrompt = source.prompt_fetch_status === 'fetched' && source.prompt?.trim()
                        ? source.prompt
                        : '';
                      const sourceCopyKey = `source-${activePromptPost.id}-${source.depth}`;
                      const isDirectSource = source.depth === 1;
                      const isImageSource = source.media_type?.includes('IMAGE');
                      const sourceLabel = isDirectSource
                        ? (isImageSource ? '元画像プロンプト / Source Image Prompt' : '元投稿プロンプト / Source Prompt')
                        : `上位プロンプト ${source.depth} / Ancestor Prompt`;
                      const sourceUrl = `https://grok.com/imagine/post/${source.grok_post_id}`;

                      return (
                        <div key={sourceCopyKey} data-testid={`prompt-source-card-${source.depth}`} className="rounded-lg border border-gray-800 bg-gray-950/30 p-3">
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h4 className="text-xs font-bold leading-tight text-gray-300">
                                {sourceLabel}
                              </h4>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-gray-500">
                                <span>depth {source.depth}</span>
                                {source.media_type && <span>{source.media_type.replace('MEDIA_POST_TYPE_', '')}</span>}
                                <a
                                  href={sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
                                >
                                  <ExternalLink size={10} /> Grok
                                </a>
                              </div>
                            </div>
                            <button
                              data-testid={`copy-source-prompt-${source.depth}`}
                              type="button"
                              onClick={() => handleCopyPrompt(sourceCopyKey, sourcePrompt)}
                              disabled={!sourcePrompt}
                              className={`inline-flex shrink-0 items-center gap-1 rounded border border-gray-700 px-2 py-1 text-[10px] transition-colors ${sourcePrompt
                                ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
                                : 'cursor-not-allowed bg-gray-800/50 text-gray-600'
                                }`}
                            >
                              <Copy size={11} />
                              {copiedPromptKey === sourceCopyKey ? 'OK' : 'Copy'}
                            </button>
                          </div>
                          <p className="text-sm leading-relaxed text-gray-100 whitespace-pre-wrap">
                            {sourcePrompt || (
                              <span className="text-gray-500 italic">
                                {getPromptStatusMessage(source.prompt_fetch_status, '上位プロンプト')}
                              </span>
                            )}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="border-t border-gray-800 pt-5 mb-6">
                    <h3 className="text-xs sm:text-sm font-bold text-gray-400 leading-tight mb-3">
                      説明・メモ <span className="hidden sm:inline">/ Description</span>
                    </h3>
                    <p className="text-sm text-gray-100 whitespace-pre-wrap leading-relaxed">
                      {description || <span className="text-gray-500 italic">No description provided.</span>}
                    </p>
                  </div>

                  {/* Comment Section (Integrated in Modal) */}
                  <div className="flex-1 mt-auto">
                    <CommentSection postId={activePromptPost.id} isAdmin={isAdmin} />
                  </div>
                </div>
              </div>

              {hasNext && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleNavigate(1); }}
                  className="absolute right-2 md:right-10 text-white/40 hover:text-white transition-colors bg-black/40 hover:bg-black/80 rounded-full p-2 z-[10010] scale-75 md:scale-100"
                >
                  <ChevronRight size={36} />
                </button>
              )}
            </div>
          </ModalPortal>
        );
      })()}

      {/* 旧ビデオモーダルは廃止済み。詳細モーダルに統合されました。 */}

      <NsfwWarningModal
        isOpen={showNsfwConfirm}
        onClose={() => setShowNsfwConfirm(false)}
        onConfirm={() => setShowNsfw(true)}
      />

      {/* 忍者AdMax: アクセス計測用の不可視iframe (v1.9.4) */}
      {/* 広告としての表示機能は廃止し、Amazonバナーに移行済み。 */}
      {/* ただしインプレッション数によるアクセス数の把握のため、1x1pxの不可視iframeとして残す。 */}
      <iframe
        src="ninja-admax-pc.html"
        width="1"
        height="1"
        frameBorder="0"
        scrolling="no"
        title="Access Counter"
        className="absolute w-[1px] h-[1px] opacity-0 pointer-events-none overflow-hidden"
        style={{ position: 'absolute', left: '-9999px' }}
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Basic Footer */}
      <footer className="border-t border-gray-800 bg-[#1a1a1a] py-8 text-center">
        <div className="container mx-auto px-4">
          <div className="mb-4 space-y-1">
            <p className="text-gray-500 text-[10px]">
              Amazonのアソシエイトとして、Grok Share Boardは適格販売により収入を得ています。
            </p>
            <p className="text-gray-500 text-[10px]">
              当サイトはアフィリエイト広告（Amazonアソシエイト含む）を掲載しています。
            </p>
          </div>
          <p className="text-gray-500 text-xs mb-4">
            &copy; 2026 Grok Share Board.
            <span className="mx-2">|</span>
            xAI Grok Imagine Curation Platform.
          </p>
          <div className="flex justify-center gap-6">
            <Link
              href="/tools/video-join"
              className="flex items-center gap-1 text-xs text-gray-400 transition-colors hover:text-white"
            >
              <Clapperboard size={14} /> Grok動画結合
            </Link>
            <a
              href="https://note.com/limber_lynx1258/n/n700edc6393f1"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-300 transition-colors text-xs flex items-center gap-1"
            >
              <LifeBuoy size={14} /> フィードバック・運営支援
            </a>
            <a
              href="https://github.com/urea/GrokShareBoard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors text-xs"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
