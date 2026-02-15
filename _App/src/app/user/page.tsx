
'use client';

import React, { useState, useEffect, Suspense } from 'react';
import VideoCard from "@/components/VideoCard";
import { supabase } from '@/lib/supabase';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Post } from '@/types';
import { useSearchParams } from 'next/navigation';

function UserPosts() {
    const searchParams = useSearchParams();
    const userId = searchParams.get('id');
    
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userId) {
            setLoading(false);
            return;
        }

        const fetchUserPosts = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('posts')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) console.error(error);
            else setPosts(data || []);
            setLoading(false);
        };
        
        fetchUserPosts();
    }, [userId]);

    if (!userId) {
        return <div className="text-center py-20 text-gray-500">User ID not specified.</div>;
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="mb-8">
                <Link href="/" className="inline-flex items-center text-gray-400 hover:text-white transition-colors mb-4">
                    <ArrowLeft size={20} className="mr-2" />
                    Back to Feed
                </Link>
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 text-center backdrop-blur-sm">
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mx-auto flex items-center justify-center text-3xl font-bold text-white mb-4">
                        {userId.charAt(0).toUpperCase()}
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">@{userId}</h1>
                    <p className="text-gray-400">{posts.length} shared creations</p>
                </div>
            </div>

            <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4 pb-20">
                {loading ? (
                    <div className="text-center text-gray-500 col-span-full py-10">Loading...</div>
                ) : posts.length > 0 ? (
                    posts.map((post) => (
                        <div key={post.id} className="break-inside-avoid mb-4">
                            <VideoCard post={post} />
                        </div>
                    ))
                ) : (
                    <div className="text-center text-gray-500 col-span-full py-10">
                        No posts found for this user.
                    </div>
                )}
            </div>

            <div className="mt-8 text-center">
                <Link href="/" className="text-blue-500 hover:text-blue-400 hover:underline">
                    &larr; Back to Home
                </Link>
            </div>
        </div>
    );
}

export default function UserPage() {
    return (
        <Suspense fallback={<div className="text-center py-20 text-white">Loading...</div>}>
            <UserPosts />
        </Suspense>
    );
}
