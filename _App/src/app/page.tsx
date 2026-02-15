
'use client';

import React, { useState, useEffect } from 'react';
import ShareInput from '@/components/ShareInput';
import VideoCard from '@/components/VideoCard';
import { Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Post } from '@/types';

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchPosts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching posts:', error);
    } else {
      setPosts(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const filteredPosts = posts.filter(post => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (post.prompt && post.prompt.toLowerCase().includes(q)) ||
      (post.user_id && post.user_id.toLowerCase().includes(q))
    );
  });

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-gray-100 font-sans">
      {/* Simple Title Bar (Monsnode style: Blue/Solid) */}
      <header className="sticky top-0 z-50 bg-[#0099cc] shadow-md">
        <div className="container mx-auto px-4 h-12 flex items-center justify-between">
          <h1 className="text-lg font-bold text-white tracking-wide">
            GrokShareBoard
          </h1>
          {/* Optional: Add simple menu or search icon here if needed */}
        </div>
      </header>

      <main className="container mx-auto px-2 pt-4">

        {/* Usages / Input Area (Collapsible or Compact) */}
        <div className="mb-6">
          <details className="group bg-[#2a2a2a] rounded-md overflow-hidden border border-gray-700">
            <summary className="cursor-pointer p-3 text-sm font-bold text-gray-300 hover:text-white flex items-center justify-between transition-colors bg-[#252525]">
              <span>📬 Post GrokImagine / Utilization Guide</span>
              <span className="group-open:rotate-180 transition-transform text-gray-500">▼</span>
            </summary>
            <div className="p-4 bg-[#202020]">
              <div className="text-xs text-gray-400 mb-4 space-y-1">
                <p>1. Grokで動画URLをコピー</p>
                <p>2. 下記にURLを貼り付け、「Post GrokImagine」を押す</p>
              </div>
              <ShareInput onPostCreated={fetchPosts} />
            </div>
          </details>
        </div>

        {/* Search Bar */}
        <div className="mb-4 flex justify-end">
          <div className="relative w-full max-w-xs">
            <input
              type="text"
              placeholder="Search query..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#2a2a2a] border border-gray-600 text-sm text-white pl-8 pr-3 py-1.5 rounded focus:ring-1 focus:ring-[#0099cc] outline-none placeholder-gray-500"
            />
            <Search className="absolute left-2.5 top-2 text-gray-500" size={14} />
          </div>
        </div>

        {/* Gallery Grid (Monsnode style: Tight masonry-like grid) */}
        {/* Use minimal gap (gap-1 or gap-2) */}
        <div className="columns-2 md:columns-4 lg:columns-5 xl:columns-6 gap-1 space-y-1 pb-20 mx-auto">
          {loading ? (
            <div className="text-center text-gray-500 col-span-full py-20 text-sm">Loading...</div>
          ) : filteredPosts.length > 0 ? (
            filteredPosts.map((post) => (
              <div key={post.id} className="break-inside-avoid mb-1">
                {/* Force compact mode and pass style prop for overlay look */}
                <VideoCard post={post} compact={true} overlayStyle={true} />
              </div>
            ))
          ) : (
            <div className="text-center text-gray-500 col-span-full py-20 text-sm">
              No posts found.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
