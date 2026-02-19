
'use client';

import React, { useState, useEffect } from 'react';
import ShareInput from '@/components/ShareInput';
import VideoCard from '@/components/VideoCard';
import { Search, FileText, History, ShieldCheck, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Post } from '@/types';
import NsfwWarningModal from '@/components/NsfwWarningModal';

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [sortBy, setSortBy] = useState<'newest' | 'popular' | 'comment'>('newest');
  const [showNsfw, setShowNsfw] = useState(false);
  const [showNsfwConfirm, setShowNsfwConfirm] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminClickCount, setAdminClickCount] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const POSTS_PER_PAGE = 24;
  const APP_VERSION = 'v1.4.9';

  const fetchPosts = async (pageNumber: number, isNewSearch: boolean = false) => {
    if (loading) return;
    setLoading(true);

    try {
      let query = supabase
        .from('posts')
        .select('*')
        .range(pageNumber * POSTS_PER_PAGE, (pageNumber + 1) * POSTS_PER_PAGE - 1);

      if (sortBy === 'newest') {
        query = query.order('created_at', { ascending: false });
      } else if (sortBy === 'popular') {
        query = query.order('clicks', { ascending: false });
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
        query = query.or(`prompt.ilike.%${q}%,user_id.ilike.%${q}%`);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching posts:', error);
      } else {
        const newPosts = data || [];

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

  const handleSortChange = (newSort: 'newest' | 'popular' | 'comment') => {
    if (newSort === sortBy) return;
    setSortBy(newSort);
  };

  const handleTitleClick = () => {
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


  return (
    <div className="min-h-screen bg-[#1a1a1a] text-gray-100 font-sans">
      {/* Simple Title Bar (Monsnode style: Blue/Solid) */}
      <header className="bg-[#0099cc] shadow-md">
        <div className="container mx-auto px-4 h-12 flex items-center justify-between">
          <h1
            className="text-lg font-bold text-white tracking-wide flex items-baseline gap-2 cursor-pointer select-none"
            onClick={handleTitleClick}
          >
            GrokShareBoard
            <span className="text-xs font-normal opacity-80">{APP_VERSION}</span>
            {isAdmin && <span className="ml-2 text-[10px] bg-white text-blue-600 px-1 rounded animate-pulse uppercase">Admin</span>}
          </h1>

          {/* Header Links */}
          <div className="flex items-center gap-3">
            {/* NSFW Toggle Switch (Segmented Control) */}
            <div className="flex bg-black/20 p-0.5 rounded-full border border-white/10 w-fit shadow-inner">
              <button
                onClick={() => setShowNsfw(false)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold transition-all ${!showNsfw
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
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold transition-all ${showNsfw
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-white/40 hover:text-white/70'
                  }`}
                title="NSFW表示ON / NSFW Mode"
              >
                <ShieldAlert size={12} />
                <span className="hidden sm:inline">NSFW</span>
              </button>
            </div>

            <div className="h-4 w-[1px] bg-white/20 mx-1" />

            <a
              href="https://github.com/urea/GrokShareBoard/blob/main/README.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/80 hover:text-white transition-colors"
              title="README"
            >
              <FileText size={20} />
            </a>
            <a
              href="https://github.com/urea/GrokShareBoard/blob/main/CHANGELOG.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/80 hover:text-white transition-colors"
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
                    <span className="opacity-70 text-[10px]">You can archive any Grok URL, whether it's your own work or something great you found on X.</span>
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
                    <span className="opacity-70 text-[10px] ml-2">(To edit or delete, re-enter the URL and click "Load".)</span>
                  </p>
                </div>
              </section>
            </div>
          </details>
        </div>

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

      <NsfwWarningModal
        isOpen={showNsfwConfirm}
        onClose={() => setShowNsfwConfirm(false)}
        onConfirm={() => setShowNsfw(true)}
      />
    </div>
  );
}
