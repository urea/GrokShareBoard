
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
              <span>📬 Post / Guide (投稿・使い方・利用規約)</span>
              <span className="group-open:rotate-180 transition-transform text-gray-500">▼</span>
            </summary>
            <div className="p-4 bg-[#202020] text-gray-300 space-y-6">

              {/* Post Instructions */}
              <section>
                <h3 className="text-sm font-bold text-white mb-2 border-b border-gray-600 pb-1">Post a URL / 投稿</h3>
                <p className="text-xs text-gray-400 mb-2">
                  After agreeing to the usage rules below, please submit the URL of your tweet using this form.
                  <br />
                  以下の利用規約に同意した上で、フォームからGrokのURLを送信してください。
                </p>
                <ShareInput onPostCreated={fetchPosts} />
              </section>

              {/* Usage Rules */}
              <section className="text-xs space-y-2 border-t border-gray-700 pt-4">
                <h3 className="text-sm font-bold text-white mb-2">Usage rules / 利用規約</h3>

                <p>
                  You can use this page to post your tweets. It is free to post and no login is required. Please use it to promote your tweets.
                  <br />
                  このページではGrokの生成物を共有できます。投稿は無料で、ログインも不要です。作品の共有にご利用ください。
                </p>

                <div className="bg-red-900/20 border border-red-900/50 p-3 rounded text-red-200">
                  <p className="font-bold text-red-400 mb-1">
                    Please do not post anything illegal, especially videos containing pornography of anyone under the age of 18.
                    <br />
                    違法なもの、特に18歳未満のポルノを含む動画は絶対に投稿しないでください。
                  </p>
                  <p className="opacity-80 mt-2">
                    This site is subject to continuous inspection by public authorities, and we actively cooperate with them. We have adopted a zero-tolerance policy for illegal postings, which may include reporting to MCMEC.
                    <br />
                    当サイトは公的機関による継続的な監視を受けており、捜査に全面的に協力しています。違法な投稿に対してはゼロトレランス方式を採用しており、MCMECへの通報を行う場合があります。
                  </p>
                </div>

                <p className="text-gray-500">
                  Illegal postings are also very damaging to this site in that they cause a decrease in traffic and require a lot of effort to monitor. We spend more than 60% of our site's operating costs to monitor these links. In order for us to provide a better service, we ask for your cooperation in avoiding illegal postings.
                  <br />
                  違法な投稿はサイトの存続に関わる重大な損害を与えます。当サイトは運営費用の60%以上を監視コストに費やしています。より良いサービス継続のため、違法投稿の防止にご協力をお願いします。
                </p>
              </section>
            </div>
          </details>
        </div>

        {/* Search Bar */}
        <div className="mb-4 flex justify-end">
          <div className="relative w-full max-w-xs">
            <input
              type="text"
              placeholder="Search / 検索 (User ID, Prompt)..."
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
