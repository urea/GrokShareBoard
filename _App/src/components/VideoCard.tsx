'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Post } from '@/types';
import { Copy, MousePointer2, MessageSquare, ExternalLink, Eye } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { createPortal } from 'react-dom';
import CommentSection from './CommentSection';

interface VideoCardProps {
    post: Post;
    compact?: boolean;
    overlayStyle?: boolean;
    isAdmin?: boolean;
    onUpdate?: (post: Post) => void;
    onOpenVideo?: () => void;
    onOpenDetails?: () => void;
}

export default function VideoCard({ post, compact = false, overlayStyle = false, isAdmin = false, onUpdate, onOpenVideo, onOpenDetails }: VideoCardProps) {
    // Helper to enforce the correct thumbnail pattern [UUID]_thumbnail.jpg
    const getValidImageUrl = (url: string | null) => {
        if (!url) return '/placeholder.png';

        if (url.includes('imagine-public.x.ai')) {
            if (url.endsWith('_thumbnail.jpg') || url.endsWith('.png') || url.endsWith('.jpg')) return url;
            return url.replace(/(\.mp4|\.png|\.jpg)$/, '') + '_thumbnail.jpg';
        }
        return url;
    };

    const displayImageUrl = getValidImageUrl(post.image_url);
    const [imageError, setImageError] = useState(false);
    const [videoError, setVideoError] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    const handleLinkClick = () => {
        // Open the video/image modal managed by parent page
        if (onOpenVideo) onOpenVideo();
    };

    const handleAdminNsfwToggle = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const newNsfw = !post.nsfw;
        try {
            const { error } = await supabase
                .from('posts')
                .update({ nsfw: newNsfw })
                .eq('id', post.id);

            if (error) throw error;
            if (onUpdate) {
                onUpdate({ ...post, nsfw: newNsfw });
            }
        } catch (err) {
            console.error('Failed to update NSFW status:', err);
            alert('Failed to update NSFW status');
        }
    };

    return (
        <motion.div
            className="relative group rounded-xl overflow-hidden bg-gray-900 border border-gray-800 shadow-lg cursor-pointer"
            whileHover={{ scale: 1.02 }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={handleLinkClick}
        >
            <div className="aspect-[2/3] relative w-full bg-black">
                {/* Thumbnail Image */}
                {!imageError ? (
                    <img
                        src={displayImageUrl}
                        alt={post.prompt || 'Grok generation'}
                        referrerPolicy="no-referrer"
                        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${isHovered && post.video_url && !videoError ? 'opacity-0' : 'opacity-100'}`}
                        onError={(e) => {
                            const target = e.currentTarget;
                            const currentSrc = target.src;

                            if (currentSrc.includes('_thumbnail.jpg')) {
                                target.src = currentSrc.replace('_thumbnail.jpg', '').replace('/share-videos/', '/share-images/') + '.jpg';
                            } else if (currentSrc.includes('/share-images/')) {
                                target.src = currentSrc.replace('/share-images/', '/share-videos/').replace('.jpg', '.png');
                            } else if (currentSrc.endsWith('.png')) {
                                if (currentSrc.includes('/share-videos/')) {
                                    target.src = currentSrc.replace('/share-videos/', '/images/').replace('.png', '.jpg');
                                } else {
                                    setImageError(true);
                                }
                            } else if (currentSrc.includes('/images/') && currentSrc.endsWith('.jpg')) {
                                setImageError(true); // Stop the infinite loop here!
                            } else {
                                setImageError(true);
                            }
                        }}
                        loading="lazy"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-800 text-gray-500 text-xs p-2 text-center text-balance">
                        Preview Unavailable
                    </div>
                )}

                {/* Video Preview on Hover */}
                {isHovered && post.video_url && !videoError && (
                    <video
                        src={post.video_url}
                        autoPlay
                        muted
                        loop
                        playsInline
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={() => {
                            console.log("Video preview failed");
                            setVideoError(true);
                        }}
                    />
                )}



                {/* Overlays (Monsnode Style) */}
                {overlayStyle && (
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/95 via-black/60 to-transparent pointer-events-none z-10 transition-opacity group-hover:opacity-100">
                        <div className="flex flex-col gap-1 pointer-events-auto">
                            {post.prompt && (
                                <p className="text-white text-xs font-medium line-clamp-2 leading-tight drop-shadow-md mb-1">
                                    {post.prompt}
                                </p>
                            )}
                            <div className="flex items-center justify-between mt-1">
                                <div className="flex gap-2 items-center h-6">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (onOpenDetails) onOpenDetails();
                                        }}
                                        className="h-full flex items-center justify-center text-[10px] text-blue-300 hover:text-blue-200 underline bg-black/50 px-2 rounded border border-transparent transition-colors"
                                    >
                                        詳細・コメント / Details
                                    </button>
                                    <a
                                        href={post.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            try {
                                                await supabase.rpc('increment_click', { post_id: post.id });
                                            } catch (err) {
                                                console.error('Failed to increment click:', err);
                                            }
                                        }}
                                        className="h-full flex items-center gap-1 text-[10px] text-gray-300 hover:text-white bg-black/50 px-2 rounded border border-gray-600 transition-colors"
                                        title="Open in Grok"
                                    >
                                        <ExternalLink size={10} /> Grok
                                    </a>
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] text-gray-400 bg-black/40 px-2 h-6 rounded-full border border-white/10 shadow-inner">
                                    <div className="flex items-center gap-1" title="Comments">
                                        <MessageSquare size={10} />
                                        <span>{post.comment_count || 0}</span>
                                    </div>
                                    <div className="w-[1px] h-3 bg-white/10" />
                                    <div className="flex items-center gap-1" title="Views">
                                        <Eye size={10} />
                                        <span>{post.views || 0}</span>
                                    </div>
                                    <div className="w-[1px] h-3 bg-white/10" />
                                    <div className="flex items-center gap-1" title="Grok Opens">
                                        <MousePointer2 size={10} />
                                        <span>{post.clicks || 0}</span>
                                    </div>
                                </div>
                                {isAdmin && (
                                    <button
                                        onClick={handleAdminNsfwToggle}
                                        className={`h-6 flex items-center justify-center text-[9px] font-bold px-1.5 rounded border transition-colors ml-1 ${post.nsfw
                                            ? 'bg-red-600 border-red-400 text-white'
                                            : 'bg-gray-700 border-gray-500 text-gray-300 hover:bg-gray-600'
                                            }`}
                                    >
                                        ADMIN:{post.nsfw ? 'NSFW' : 'SFW'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Info Area */}
            {!overlayStyle && (
                <div className={`${compact ? 'p-2' : 'p-3'}`}>
                    {!compact && (
                        <p className="text-gray-300 text-sm line-clamp-2 mb-2" title={post.prompt || ''}>
                            {post.prompt || 'No prompt info'}
                        </p>
                    )}
                    <div className={`text-gray-500 flex justify-between items-center ${compact ? 'text-[10px]' : 'text-xs'}`}>
                        <div className="flex items-center gap-2">
                            <span className="flex gap-2 items-center">
                                {!compact && new Date(post.created_at).toLocaleDateString()}
                            </span>
                            {!compact && <span>{post.site_name || 'Grok'}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                            <a
                                href={post.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                        await supabase.rpc('increment_click', { post_id: post.id });
                                    } catch (err) {
                                        console.error('Failed to increment click:', err);
                                    }
                                }}
                                className="flex items-center gap-1 mr-1 text-gray-400 hover:text-blue-400 transition-colors"
                                title="Open in Grok"
                            >
                                <ExternalLink size={compact ? 12 : 14} />
                            </a>
                            <div className="flex items-center gap-1.5 opacity-80 bg-gray-800/50 px-2 py-0.5 rounded-full border border-gray-700/50" title="Views">
                                <Eye size={compact ? 10 : 12} className="text-gray-400" />
                                <span className="font-medium text-gray-300">{post.views || 0}</span>
                            </div>
                            <div className="flex items-center gap-1.5 opacity-80 bg-gray-800/50 px-2 py-0.5 rounded-full border border-gray-700/50" title="Grok Opens">
                                <MousePointer2 size={compact ? 10 : 12} className="text-gray-400" />
                                <span className="font-medium text-gray-300">{post.clicks || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </motion.div>
    );
}
