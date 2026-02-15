
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Plus, Sparkles, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Define local interface for Preview Data
interface PreviewData {
    url: string;
    videoUrl: string;
    imageUrl: string;
    siteName: string;
    title?: string;
    description?: string;
    userId?: string | null;
}

export default function ShareInput({ onPostCreated }: { onPostCreated: () => void }) {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState<PreviewData | null>(null);
    const [editablePrompt, setEditablePrompt] = useState('');
    const [editableUserId, setEditableUserId] = useState('');
    const [previewImageError, setPreviewImageError] = useState(false);
    const [error, setError] = useState('');



    // Load saved User ID on mount
    useEffect(() => {
        const savedUserId = localStorage.getItem('grok_share_userid');
        if (savedUserId) {
            setEditableUserId(savedUserId);
        }
    }, []);



    const handleAnalyze = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!url) return;
        setLoading(true);
        setError('');
        setPreview(null);
        setEditablePrompt('');
        setPreviewImageError(false);
        setPreviewImageError(false);

        try {
            // Client-side regex extraction (GitHub Pages compatible)
            // Pattern: https://grok.com/imagine/post/[UUID]
            const uuidMatch = url.match(/post\/([a-f0-9-]{36})/);
            if (!uuidMatch) {
                throw new Error('Invalid Grok URL format. Could not find UUID.');
            }
            const uuid = uuidMatch[1];

            // Construct public URLs
            // Video: https://imagine-public.x.ai/imagine-public/share-videos/[UUID].mp4
            // Image (Thumbnail): https://imagine-public.x.ai/imagine-public/share-videos/[UUID]_thumbnail.jpg
            // Note: High-res images have randomized UUIDs and cannot be guessed client-side. 
            // We use the thumbnail/poster image which follows the predictable UUID pattern.
            const videoUrl = `https://imagine-public.x.ai/imagine-public/share-videos/${uuid}.mp4`;
            const imageUrl = `https://imagine-public.x.ai/imagine-public/share-videos/${uuid}_thumbnail.jpg`;

            const mockPreview: PreviewData = {
                url: url,
                videoUrl: videoUrl,
                imageUrl: imageUrl,
                siteName: 'Grok',
                title: 'Grok Creation',
                description: '',
                userId: null
            };

            setPreview(mockPreview);
            setEditablePrompt('');

        } catch (err: any) {
            setError(err.message || 'Error analyzing URL');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleShare = async () => {
        if (!preview) return;

        setLoading(true);
        try {
            const { error: insertError } = await supabase
                .from('posts')
                .insert([
                    {
                        url: preview.url,
                        prompt: editablePrompt,
                        user_id: editableUserId.trim() || null,
                        video_url: preview.videoUrl,
                        image_url: preview.imageUrl,
                        site_name: preview.siteName,
                        title: preview.title,
                        width: 0,
                        height: 0
                    }
                ]);

            if (insertError) {
                if (insertError.code === '23505') throw new Error('URL already shared!');
                throw insertError;
            }

            if (editableUserId.trim()) {
                localStorage.setItem('grok_share_userid', editableUserId.trim());
            }

            setUrl('');
            setPreview(null);
            setEditablePrompt('');
            onPostCreated();
        } catch (err: any) {
            setError(err.message || 'Error sharing post');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto mb-8 space-y-4">
            {/* 1. URL Input Section */}
            <div className="bg-gray-900/50 p-6 rounded-2xl border border-gray-800 backdrop-blur-sm">
                <form onSubmit={handleAnalyze} className="flex gap-2">
                    <input
                        type="url"
                        placeholder="Paste Grok URL (GrokのURLを貼り付け) ..."
                        className="w-full flex-1 bg-gray-800 border-gray-700 text-white px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        required
                    />
                    <button
                        type="submit"
                        disabled={loading}
                        className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-lg font-bold transition-colors flex items-center gap-2 whitespace-nowrap shadow-md shadow-purple-900/20"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <Sparkles size={18} fill="currentColor" />}
                        Load / 読み込み
                    </button>
                </form>
                {error && <p className="text-red-400 mt-2 text-sm">{error}</p>}
            </div>

            {/* 2. Manual Entry & Preview Section */}
            {preview && (
                <div className="bg-gray-900/50 p-6 rounded-2xl border border-gray-800 backdrop-blur-sm animate-in fade-in slide-in-from-top-2">
                    <div className="flex flex-col md:flex-row gap-6">

                        {/* Left: Input Fields */}
                        <div className="flex-1 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">User ID / ユーザーID</label>
                                <input
                                    type="text"
                                    value={editableUserId}
                                    onChange={(e) => setEditableUserId(e.target.value)}
                                    placeholder="e.g. your_x_handle"
                                    className="w-full bg-gray-800 border-gray-700 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Prompt / Description (プロンプト・説明)</label>
                                <textarea
                                    value={editablePrompt}
                                    onChange={(e) => setEditablePrompt(e.target.value)}
                                    placeholder="Describe the video content or paste the prompt... (Optional) / プロンプトや説明を入力..."
                                    className="w-full bg-gray-800 border-gray-700 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-32 resize-none"
                                    autoFocus
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setPreview(null)}
                                    className="px-4 py-2 text-gray-400 hover:text-white transition-colors text-sm"
                                >
                                    Cancel / キャンセル
                                </button>
                                <button
                                    onClick={handleShare}
                                    disabled={loading || previewImageError}
                                    className={`bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 shadow-lg shadow-green-900/20 transition-all ${loading || previewImageError ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:scale-105 active:scale-95'}`}
                                >
                                    {loading ? <Loader2 className="animate-spin" /> : <Plus size={18} />}
                                    Share / 投稿する
                                </button>
                            </div>
                        </div>

                        {/* Right: Visual Preview */}
                        <div className="w-full md:w-48 shrink-0 flex flex-col gap-2">
                            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">Preview</label>
                            <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden bg-black border border-gray-700 shadow-md flex items-center justify-center">

                                {/* Thumbnail Image Only (User requested to prioritize image) */}
                                {preview.imageUrl && !previewImageError ? (
                                    <div className="relative w-full h-full group cursor-pointer" onClick={() => window.open(preview.url, '_blank')}>
                                        <img
                                            src={preview.imageUrl}
                                            alt="Thumbnail"
                                            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
                                            onError={() => {
                                                console.error("Image load failed");
                                                setPreviewImageError(true);
                                            }}
                                            onLoad={() => setLoading(false)}
                                        />

                                        {/* Overlay to indicate it's a link */}
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                                            <div className="bg-black/50 p-2 rounded-full backdrop-blur-sm">
                                                <Sparkles size={16} className="text-white" />
                                            </div>
                                        </div>
                                    </div>
                                ) : previewImageError ? (
                                    <div className="flex flex-col items-center justify-center text-center p-4 h-full bg-gray-900 text-red-400 gap-2">
                                        <div className="bg-red-900/20 p-2 rounded-full mb-1">
                                            <span className="text-xl">⚠️</span>
                                        </div>
                                        <p className="text-xs font-bold">Unsupported / 非対応</p>
                                        <p className="text-[10px] leading-tight text-gray-400">
                                            Image-only posts are not supported.
                                            <br />
                                            画像のみのポストは非対応です。
                                        </p>
                                        <button
                                            className="text-[10px] text-blue-400 underline mt-2 hover:text-blue-300"
                                            onClick={() => window.open(preview.url, '_blank')}
                                        >
                                            Open in Grok / Grokで開く
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center text-gray-500 gap-2">
                                        <Loader2 className="animate-spin" size={20} />
                                        <span className="text-xs text-center">Loading / 読み込み中...</span>
                                    </div>
                                )}
                            </div>
                            <div className="text-center">
                                <p className="text-xs text-gray-500 truncate">{preview.siteName}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Add successLoad helper or just simplify state?
// Simplified above: logic is dense. Let's ensure 'successLoad' isn't undefined.
// Ah, I used 'successLoad' in the className but didn't define it.
// Actually, video visibility logic is tricky.
// Let's just make video opacity 100 always if it exists, because it covers the image anyway if z-indexed or placed after.
// Or if videoError is true, maybe show placeholder?
// Refactoring className line 237 roughly:
// className={`absolute inset-0 w-full h-full object-cover`}
// The previous logic was hiding it if image existed.
// Let's rely on z-index or standard flow. The video should be top if it's working.
