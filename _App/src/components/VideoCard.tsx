'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Post } from '@/types';
import { MousePointer2, ExternalLink, Eye, Info, Play, Trash2, Share2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface VideoCardProps {
    post: Post;
    compact?: boolean;
    overlayStyle?: boolean;
    isAdmin?: boolean;
    onUpdate?: (post: Post) => void;
    onOpenVideo?: () => void;
    onOpenDetails?: () => void;
    onDelete?: (postId: string) => void;
}

const metricCountFormatter = new Intl.NumberFormat('ja-JP', {
    notation: 'compact',
    maximumFractionDigits: 1,
});

function formatMetricCount(value: number | null) {
    return metricCountFormatter.format(value ?? 0);
}

const overlayActionClassName = 'flex h-7 min-w-0 items-center justify-center gap-1 rounded border border-white/10 bg-black/55 px-1 text-[9px] font-semibold text-gray-100 transition-colors hover:border-white/20 hover:bg-black/70 hover:text-white sm:text-[10px]';

export default function VideoCard({ post, compact = false, overlayStyle = false, isAdmin = false, onUpdate, onOpenVideo, onOpenDetails, onDelete }: VideoCardProps) {
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
    const isVideo = Boolean(post.video_url?.toLowerCase().includes('.mp4'));
    const fetchedPrompt = post.prompt_fetch_status === 'fetched' ? post.prompt : null;
    const displayText = post.description || fetchedPrompt;
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

    const handleAdminDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm('【管理者権限】本当にこの投稿を完全に削除しますか？\n(Admin operation: Delete this post completely?)')) return;

        try {
            const { error } = await supabase
                .from('posts')
                .delete()
                .eq('id', post.id);

            if (error) throw error;
            if (onDelete) {
                onDelete(post.id);
            }
        } catch (err) {
            console.error('Failed to delete post:', err);
            alert('Failed to delete post');
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
                        alt={displayText || 'Grok generation'}
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

                {/* Video Indicator Icon */}
                {isVideo && (
                    <div className={`absolute top-2 right-2 bg-black/50 backdrop-blur-sm p-1.5 rounded-full border border-white/10 z-10 shadow-lg pointer-events-none transition-opacity duration-300 ${isHovered && post.video_url && !videoError ? 'opacity-0' : 'opacity-100'}`}>
                        <Play size={14} className="text-white fill-white opacity-90" />
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
                            {displayText && (
                                <p className="text-white text-xs font-medium line-clamp-2 leading-tight drop-shadow-md mb-1">
                                    {displayText}
                                </p>
                            )}
                            <div className="mt-1 grid grid-cols-3 gap-1.5">
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (onOpenDetails) onOpenDetails();
                                    }}
                                    className={overlayActionClassName}
                                    title="投稿の詳細を見る"
                                    aria-label="投稿の詳細を見る"
                                >
                                    <Info size={11} className="shrink-0" />
                                    <span className="whitespace-nowrap">詳細</span>
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
                                    className={overlayActionClassName}
                                    title="Grokで見る"
                                    aria-label="Grokで見る"
                                >
                                    <ExternalLink size={11} className="shrink-0" />
                                    <span className="whitespace-nowrap">Grokで見る</span>
                                </a>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const siteUrl = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname.split('?')[0].replace(/\/$/, '')}` : '';
                                        const shareUrl = `${siteUrl}?postId=${post.id}`;
                                        const shareText = 'GrokShareBoard\u306e\u6295\u7a3f\u3092\u30c1\u30a7\u30c3\u30af\uff01';
                                        const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}&hashtags=GrokShareBoard`;
                                        window.open(tweetUrl, '_blank', 'noopener,noreferrer');
                                    }}
                                    className={overlayActionClassName}
                                    title="Xで共有"
                                    aria-label="Xで共有"
                                >
                                    <Share2 size={11} className="shrink-0" />
                                    <span className="whitespace-nowrap">Xで共有</span>
                                </button>
                            </div>
                            <div className="grid h-7 grid-cols-3 divide-x divide-white/10 overflow-hidden rounded border border-white/10 bg-black/45 text-gray-300 shadow-inner">
                                <div className="flex min-w-0 items-center justify-center gap-1 whitespace-nowrap px-0.5 leading-none" title="コメント数">
                                    <span className="text-[8px] text-gray-400 sm:text-[9px]">コメント</span>
                                    <span className="text-[10px] font-semibold tabular-nums text-gray-100 sm:text-[11px]">{formatMetricCount(post.comment_count)}</span>
                                </div>
                                <div className="flex min-w-0 items-center justify-center gap-1 whitespace-nowrap px-0.5 leading-none" title="閲覧数">
                                    <span className="text-[8px] text-gray-400 sm:text-[9px]">閲覧</span>
                                    <span className="text-[10px] font-semibold tabular-nums text-gray-100 sm:text-[11px]">{formatMetricCount(post.views)}</span>
                                </div>
                                <div className="flex min-w-0 items-center justify-center gap-1 whitespace-nowrap px-0.5 leading-none" title="Grokを開いた回数">
                                    <span className="text-[8px] text-gray-400 sm:text-[9px]">Grok遷移</span>
                                    <span className="text-[10px] font-semibold tabular-nums text-gray-100 sm:text-[11px]">{formatMetricCount(post.clicks)}</span>
                                </div>
                            </div>
                            {isAdmin && (
                                <div className="flex justify-end gap-1 pt-0.5">
                                    <button
                                        type="button"
                                        onClick={handleAdminNsfwToggle}
                                        className={`flex h-6 items-center justify-center rounded border px-1.5 text-[9px] font-bold transition-colors ${post.nsfw
                                            ? 'border-red-400 bg-red-600 text-white'
                                            : 'border-gray-500 bg-gray-700 text-gray-300 hover:bg-gray-600'
                                            }`}
                                    >
                                        ADMIN:{post.nsfw ? 'NSFW' : 'SFW'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleAdminDelete}
                                        className="flex h-6 items-center justify-center rounded border border-red-900 bg-red-950/80 px-1.5 text-[9px] font-bold text-red-500 transition-colors hover:bg-red-700 hover:text-white"
                                        title="強制削除 / Force Delete"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Info Area */}
            {!overlayStyle && (
                <div className={`${compact ? 'p-2' : 'p-3'}`}>
                    {!compact && (
                        <p className="text-gray-300 text-sm line-clamp-2 mb-2" title={displayText || ''}>
                            {displayText || 'No description'}
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
                                title="Grokで見る"
                                aria-label="Grokで見る"
                            >
                                <ExternalLink size={compact ? 12 : 14} />
                            </a>
                            {/* Xシェアボタン（通常モード）: アイコンのみでコンパクトに配置 */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const siteUrl = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname.split('?')[0].replace(/\/$/, '')}` : '';
                                    const shareUrl = `${siteUrl}?postId=${post.id}`;
                                    const shareText = 'GrokShareBoard\u306e\u6295\u7a3f\u3092\u30c1\u30a7\u30c3\u30af\uff01';
                                    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}&hashtags=GrokShareBoard`;
                                    window.open(tweetUrl, '_blank', 'noopener,noreferrer');
                                }}
                                className="flex items-center gap-1 mr-1 text-gray-400 hover:text-sky-400 transition-colors"
                                title="Xで共有"
                                aria-label="Xで共有"
                            >
                                <Share2 size={compact ? 12 : 14} />
                            </button>
                            <div className="flex items-center gap-1.5 opacity-80 bg-gray-800/50 px-2 py-0.5 rounded-full border border-gray-700/50" title="閲覧数">
                                <Eye size={compact ? 10 : 12} className="text-gray-400" />
                                <span className="font-medium text-gray-300">{post.views || 0}</span>
                            </div>
                            <div className="flex items-center gap-1.5 opacity-80 bg-gray-800/50 px-2 py-0.5 rounded-full border border-gray-700/50" title="Grokを開いた回数">
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
