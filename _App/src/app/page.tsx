
'use client';

import React, { useState, useEffect } from 'react';
import ShareInput from '@/components/ShareInput';
import VideoCard from '@/components/VideoCard';
import { Search, FileText, History } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Post } from '@/types';

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const POSTS_PER_PAGE = 24;
  const APP_VERSION = 'v1.1.18';

  const fetchPosts = async (pageNumber: number, isNewSearch: boolean = false) => {
    if (loading) return;
    setLoading(true);

    try {
      let query = supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
        .range(pageNumber * POSTS_PER_PAGE, (pageNumber + 1) * POSTS_PER_PAGE - 1);

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
    fetchPosts(0, true);
  }, []);

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

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-gray-100 font-sans">
      {/* Simple Title Bar (Monsnode style: Blue/Solid) */}
      <header className="sticky top-0 z-50 bg-[#0099cc] shadow-md">
        <div className="container mx-auto px-4 h-12 flex items-center justify-between">
          <h1 className="text-lg font-bold text-white tracking-wide flex items-baseline gap-2">
            GrokShareBoard
            <span className="text-xs font-normal opacity-80">{APP_VERSION}</span>
          </h1>

          {/* Header Links */}
          <div className="flex items-center gap-4">
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
                  <span>Click to Post & Guide</span>
                  <span className="text-gray-400 font-normal text-xs md:text-sm">/ 投稿はこちら・使い方・規約</span>
                </div>
              </div>
              <span className="group-open:rotate-180 transition-transform text-gray-500">▼</span>
            </summary>
            <div className="p-4 bg-[#202020] text-gray-300 space-y-6">
              {/* Post Instructions & Form */}
              <section>
                <div className="flex items-center gap-2 mb-3 border-b border-gray-700 pb-2">
                  <h3 className="text-sm font-bold text-white">Share Grok Imagine / 投稿する</h3>
                </div>
                <p className="text-xs text-gray-400 mb-4">
                  After agreeing to the usage rules below, please submit the URL of your Grok generation.
                  <br />
                  以下の利用規約に同意した上で、GrokのURL（https://grok.com/imagine/...）を送信してください。
                </p>
                <ShareInput onPostCreated={() => {
                  setPage(0);
                  setHasMore(true);
                  fetchPosts(0, true);
                }} />
              </section>

              {/* Usage Rules */}
              <section className="text-xs space-y-2 border-t border-gray-700 pt-4">
                <h3 className="text-sm font-bold text-gray-300 mb-2">Usage rules / 利用規約</h3>
                <p>
                  You can use this page to post your creations. It is free to post and no login is required.
                  <br />
                  このページではGrokの生成物を共有できます。投稿は無料、ログイン不要です。
                </p>

                <div className="bg-red-900/10 border border-red-900/30 p-3 rounded text-red-300/80">
                  <p className="font-bold text-red-400/80 mb-1">
                    Please do not post anything illegal.
                    <br />
                    違法なもの、公序良俗に反する内容は絶対に投稿しないでください。
                  </p>
                </div>

                <div className="bg-blue-900/10 border border-blue-900/30 p-3 rounded text-blue-300/80 mt-2">
                  <p className="font-bold text-blue-400/80 mb-1">How to Edit or Delete / 編集・削除について</p>
                  <p className="text-xs">
                    To edit or delete a post, simply enter the same Grok URL again in the form above and click "Load".
                    <br />
                    編集・削除したい場合は、再度そのGrok URLを入力して「読み込み」を押してください。
                  </p>
                </div>
              </section>
            </div>
          </details>
        </div>

        {/* Search Bar */}
        <div className="mb-4 flex justify-end">
          <form onSubmit={handleSearch} className="relative w-full max-w-xs flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search / 検索 (Prompt)..."
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
                <VideoCard post={post} compact={true} overlayStyle={true} />
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
              {loading ? 'Loading...' : 'Load More / もっと読み込む'}
            </button>
          ) : posts.length > 0 ? (
            <div className="text-gray-600 text-xs">No more posts / これ以上はありません</div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
