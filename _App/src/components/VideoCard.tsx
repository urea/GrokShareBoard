
'use client';

import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Post } from '@/types';
import { Play } from 'lucide-react';

interface VideoCardProps {
    post: Post;
    compact?: boolean;
    overlayStyle?: boolean;
}

export default function VideoCard({ post, compact = false, overlayStyle = false }: VideoCardProps) {
    // Helper to enforce the correct thumbnail pattern [UUID]_thumbnail.jpg
    const getValidImageUrl = (url: string | null) => {
        if (!url) return '/placeholder.png';
        // If it's a Grok video/image URL, ensure it uses _thumbnail.jpg
        if (url.includes('imagine-public.x.ai') && url.includes('/share-videos/')) {
            // Replace .png, .mp4, or just ensure it ends with _thumbnail.jpg
            // Regex to strip existing extension and suffix
            return url.replace(/(\.mp4|\.png|\.jpg)$/, '') + '_thumbnail.jpg';
        }
        return url;
    };

    // Use the patched URL
    const displayImageUrl = getValidImageUrl(post.image_url);

    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [imageError, setImageError] = useState(false);

    const handleMouseEnter = async () => {
        if (!post.video_url || !videoRef.current) return;
        setIsPlaying(true);
        try {
            await videoRef.current.play();
        } catch (e: any) {
            // AbortError is expected if user leaves quickly, ignore it.
            if (e.name !== 'AbortError') {
                console.warn("Play failed", e);
            }
        }
    };

    const handleMouseLeave = () => {
        setIsPlaying(false);
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.currentTime = 0;
        }
    };

    return (
        <motion.div
            className="relative group rounded-xl overflow-hidden bg-gray-900 border border-gray-800 shadow-lg cursor-pointer"
            whileHover={{ scale: 1.02 }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={() => window.open(post.url, '_blank')}
        >
            <div className="aspect-[2/3] relative w-full bg-black">

                {/* Video Player (Visible if playing OR if image failed to load, and video is loaded) */}
                {post.video_url && (
                    <video
                        ref={videoRef}
                        src={post.video_url}
                        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${isPlaying && !imageError ? 'opacity-100' : 'opacity-0'}`}
                        muted
                        loop
                        playsInline
                        preload="none" // Only load on hover
                        onError={(e) => {
                            console.warn("VideoCard play error", e);
                            setImageError(false); // Fallback to image
                        }}
                    />
                )}

                {/* Thumbnail Image (Hidden if playing OR if validation failed) */}
                {!imageError && (
                    <img
                        src={displayImageUrl}
                        alt={post.prompt || 'Grok generation'}
                        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${isPlaying ? 'opacity-0' : 'opacity-100'}`}
                        onError={() => setImageError(true)}
                    />
                )}

                {/* Play Icon Overlay */}
                {!isPlaying && post.video_url && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-transparent transition-colors">
                        {/* Scale down play icon further for dense grid */}
                        <Play className="w-10 h-10 text-white/70 drop-shadow-md" fill="currentColor" />
                    </div>
                )}

                {/* Overlays (Monsnode Style) */}
                {overlayStyle && (
                    <>
                        <div className="absolute bottom-0 left-0 right-0 p-1 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
                            <div className="flex justify-between items-end">
                                {post.user_id && (
                                    <span className="bg-blue-600/90 text-white text-[10px] px-1.5 py-0.5 rounded-sm font-bold shadow-sm pointer-events-auto">
                                        <a href={`/user?id=${post.user_id}`} onClick={(e) => e.stopPropagation()}>{post.user_id}</a>
                                    </span>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Bottom Info Area - render only if NOT using overlayStyle */}
            {!overlayStyle && (
                <div className={`${compact ? 'p-2' : 'p-3'}`}>
                    {!compact && (
                        <p className="text-gray-300 text-sm line-clamp-2 mb-2" title={post.prompt || ''}>
                            {post.prompt || 'No prompt info'}
                        </p>
                    )}
                    <div className={`text-gray-500 flex justify-between items-center ${compact ? 'text-[10px]' : 'text-xs'}`}>
                        <span className="flex gap-2 items-center">
                            {!compact && new Date(post.created_at).toLocaleDateString()}
                            {compact && post.user_id ? (
                                <span className="truncate max-w-[60px] text-blue-400" title={post.user_id}>@{post.user_id}</span>
                            ) : post.user_id && (
                                <a href={`/user?id=${post.user_id}`} onClick={(e) => e.stopPropagation()} className="text-blue-400 hover:text-blue-300 hover:underline z-10 relative">
                                    User
                                </a>
                            )}
                        </span>
                        {!compact && <span>{post.site_name || 'Grok'}</span>}
                    </div>
                </div>
            )}
        </motion.div>
    );
}
