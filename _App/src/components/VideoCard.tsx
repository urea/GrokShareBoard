
'use client';

import React, { useRef, useState, useEffect } from 'react';
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

        // If it's a Grok video/image URL
        if (url.includes('imagine-public.x.ai')) {
            // If it already ends with _thumbnail.jpg or .png or .jpg, return as is (Trust the DB if it was updated by ShareInput)
            if (url.endsWith('_thumbnail.jpg') || url.endsWith('.png') || url.endsWith('.jpg')) return url;

            // Default fallback for raw UUIDs or old data: try thumbnail
            return url.replace(/(\.mp4|\.png|\.jpg)$/, '') + '_thumbnail.jpg';
        }
        return url;
    };

    // Use the patched URL
    const displayImageUrl = getValidImageUrl(post.image_url);
    const [imageError, setImageError] = useState(false);
    const [showFullPrompt, setShowFullPrompt] = useState(false);

    return (
        <motion.div
            className="relative group rounded-xl overflow-hidden bg-gray-900 border border-gray-800 shadow-lg cursor-pointer"
            whileHover={{ scale: 1.02 }}
            onClick={() => window.open(post.url, '_blank')}
        >
            <div className="aspect-[2/3] relative w-full bg-black">
                {/* Thumbnail Image */}
                {!imageError ? (
                    <img
                        src={displayImageUrl}
                        alt={post.prompt || 'Grok generation'}
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => {
                            // Multi-stage fallback:
                            // 1. _thumbnail.jpg (Default) -> Fails
                            // 2. Try .png (High res video frame)
                            // 3. Try .jpg (Static image post path: .../images/[UUID].jpg)

                            const target = e.currentTarget;
                            const currentSrc = target.src;

                            if (currentSrc.includes('_thumbnail.jpg')) {
                                // Try .png next
                                target.src = currentSrc.replace('_thumbnail.jpg', '.png');
                            } else if (currentSrc.endsWith('.png')) {
                                // Try static image path .jpg
                                // Note: Path changes from /share-videos/ to /images/
                                if (currentSrc.includes('/share-videos/')) {
                                    target.src = currentSrc.replace('/share-videos/', '/images/').replace('.png', '.jpg');
                                } else {
                                    setImageError(true);
                                }
                            } else {
                                // Give up
                                setImageError(true);
                            }
                        }}
                        loading="lazy"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-800 text-gray-500 text-xs p-2 text-center">
                        Image Unavailable
                    </div>
                )}

                {/* Overlays (Monsnode Style) */}
                {overlayStyle && (
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/90 via-black/60 to-transparent pointer-events-none">
                        <div className="flex flex-col gap-1 pointer-events-auto">
                            {/* Prompt/Comment */}
                            {post.prompt && (
                                <div>
                                    <p className="text-white text-xs font-medium line-clamp-2 leading-tight drop-shadow-md mb-1">
                                        {post.prompt}
                                    </p>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowFullPrompt(true);
                                        }}
                                        className="text-[10px] text-blue-300 hover:text-blue-200 underline cursor-pointer bg-black/50 px-1 rounded inline-block"
                                    >
                                        More / 全文
                                    </button>
                                </div>
                            )}

                            {/* User ID */}
                            <div className="flex justify-between items-end mt-1">
                                {post.user_id && (
                                    <span className="bg-blue-600/90 text-white text-[10px] px-1.5 py-0.5 rounded-sm font-bold shadow-sm opacity-80 group-hover:opacity-100 transition-opacity">
                                        <a href={`/user?id=${post.user_id}`} onClick={(e) => e.stopPropagation()}>{post.user_id}</a>
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Full Prompt Overlay Modal - Using Portal to escape stacking context */}
            {showFullPrompt && (
                <ModalPortal>
                    <div
                        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowFullPrompt(false);
                        }}
                    >
                        <div
                            className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-2xl relative"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={() => setShowFullPrompt(false)}
                                className="absolute top-3 right-3 text-gray-400 hover:text-white"
                            >
                                ✕ Close
                            </button>
                            <h3 className="text-sm font-bold text-gray-400 mb-2">Prompt / Description</h3>
                            <p className="text-sm text-gray-100 whitespace-pre-wrap leading-relaxed">
                                {post.prompt}
                            </p>
                            {post.user_id && (
                                <div className="mt-4 pt-4 border-t border-gray-800 text-xs text-gray-500">
                                    Posted by: <span className="text-blue-400">@{post.user_id}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </ModalPortal>
            )}

            {/* Bottom Info Area - Only show if strict compact mode isn't forcing overlay-only, 
                BUT user requested prompt display. If overlayStyle is used, prompt is now inside image.
                If overlayStyle is FALSE, we keep the original bottom area. 
            */}
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

// Simple Portal Component
import { createPortal } from 'react-dom';

function ModalPortal({ children }: { children: React.ReactNode }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!mounted) return null;
    return createPortal(children, document.body);
}
