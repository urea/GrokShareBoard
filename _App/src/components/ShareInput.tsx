'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, X, Loader2, Image as ImageIcon, AlertTriangle, Sparkles, RefreshCw, Trash2, Edit, Clock } from 'lucide-react';
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
    // const [editableUserId, setEditableUserId] = useState(''); // Abolished
    const [previewImageError, setPreviewImageError] = useState(false);
    const [error, setError] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [isNsfw, setIsNsfw] = useState(false);



    // Generate or retrieve anonymous Client ID
    const getOrCreateClientId = () => {
        let clientId = localStorage.getItem('grok_share_client_id');
        if (!clientId) {
            clientId = crypto.randomUUID();
            localStorage.setItem('grok_share_client_id', clientId);
        }
        return clientId;
    };

    const handleAnalyze = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!url) return;
        setLoading(true);
        setError('');
        setPreview(null);
        // setEditablePrompt(''); // REMOVED: Preserve user input
        setPreviewImageError(false);
        setIsEditing(false);

        try {
            // Client-side regex extraction (GitHub Pages compatible)
            // Pattern: https://grok.com/imagine/post/[UUID]
            const uuidMatch = url.match(/post\/([a-f0-9-]{36})/);
            if (!uuidMatch) {
                throw new Error('Invalid Grok URL format. Could not find UUID.');
            }
            const uuid = uuidMatch[1];

            // Check if URL already exists in DB
            const { data: existingPost, error: fetchError } = await supabase
                .from('posts')
                .select('*')
                .eq('url', url)
                .single();

            if (existingPost) {
                // Edit Mode
                setIsEditing(true);

                // Normalize Image URL to ensure it uses _thumbnail.jpg (Fix for legacy .png data)
                let dbImageUrl = existingPost.image_url || '';
                if (dbImageUrl && !dbImageUrl.endsWith('_thumbnail.jpg') && !dbImageUrl.endsWith('.png') && !dbImageUrl.endsWith('.jpg')) {
                    dbImageUrl = dbImageUrl.replace(/(\.mp4|\.png|\.jpg)$/, '') + '_thumbnail.jpg';
                }

                setPreview({
                    url: existingPost.url,
                    videoUrl: existingPost.video_url || '',
                    imageUrl: dbImageUrl,
                    siteName: existingPost.site_name || 'Grok',
                    title: existingPost.title || 'Grok Creation',
                    description: existingPost.prompt || '',
                    userId: existingPost.user_id
                });
                setEditablePrompt(existingPost.prompt || '');
                setIsNsfw(!!existingPost.nsfw); // Set NSFW state from DB
                // setEditableUserId(existingPost.user_id || ''); // Abolished
                setLoading(false);
                return;
            }

            // Construct public URLs
            // Video: https://imagine-public.x.ai/imagine-public/share-videos/[UUID].mp4
            // Image (Thumbnail): https://imagine-public.x.ai/imagine-public/share-videos/[UUID]_thumbnail.jpg
            const videoUrl = `https://imagine-public.x.ai/imagine-public/share-videos/${uuid}.mp4`;
            const imageUrl = `https://imagine-public.x.ai/imagine-public/share-videos/${uuid}_thumbnail.jpg`;

            // Detect if video actually exists before setting it in preview
            // (Uses a temporary video element to check availability)
            let detectedVideoUrl = '';
            let detectedImageUrl = imageUrl;

            try {
                const checkVideo = () => new Promise<string>((resolve) => {
                    const v = document.createElement('video');
                    v.preload = 'metadata';
                    v.src = videoUrl;
                    v.onloadedmetadata = () => resolve(videoUrl);
                    v.onerror = () => resolve('');
                    // Timeout after 3 seconds to avoid hanging
                    setTimeout(() => resolve(''), 3000);
                });

                detectedVideoUrl = await checkVideo();

                // If it's not a video, it might be a static image under /share-images/
                if (!detectedVideoUrl) {
                    detectedImageUrl = `https://imagine-public.x.ai/imagine-public/share-images/${uuid}.jpg`;
                }
            } catch (e) {
                console.warn("Media detection failed, defaulting to thumbnail.");
            }

            const mockPreview: PreviewData = {
                url: url,
                videoUrl: detectedVideoUrl,
                imageUrl: detectedImageUrl,
                siteName: 'Grok',
                title: 'Grok Creation',
                description: '',
                userId: null
            };

            setPreview(mockPreview);

        } catch (err: any) {
            setError(err.message || 'Error analyzing URL');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = async () => {
        if (!preview) return;
        setLoading(true);
        try {
            // Use existing User ID if present (creator), or current client ID if missing
            // Actually, for integrity, we should NOT change the user_id on update if it exists.
            // But if it's null, we can adopt it.
            // Let's just keep the original user_id. We don't update it.

            // If image preview failed, fallback to canonical thumbnail URL
            let finalImageUrl = preview.imageUrl;
            if (previewImageError) {
                const uuidMatch = preview.url.match(/post\/([a-f0-9-]{36})/);
                if (uuidMatch) {
                    finalImageUrl = `https://imagine-public.x.ai/imagine-public/share-videos/${uuidMatch[1]}_thumbnail.jpg`;
                }
            }

            const cleanImageUrl = finalImageUrl.split('?')[0];
            const cleanPreviewUrl = preview.url.split('?')[0];

            const { data: updatedData, error: updateError } = await supabase
                .from('posts')
                .update({
                    prompt: editablePrompt,
                    image_url: cleanImageUrl,
                    nsfw: isNsfw,
                    // user_id: editableUserId.trim() || null, // Abolished: Do not update user_id
                })
                .eq('url', cleanPreviewUrl)
                .select('id');

            if (updateError) throw updateError;
            if (!updatedData || updatedData.length === 0) throw new Error('更新失敗: 権限がないか、投稿が見つかりません (RLS設定を確認してください) / Update failed: Permission denied or post not found. check RLS policies.');

            // Success state
            setUrl('');
            setPreview(null);
            setEditablePrompt('');
            setIsEditing(false);
            onPostCreated(); // Refresh feed
            alert('投稿を更新しました / Post updated successfully!');
        } catch (err: any) {
            setError(err.message || 'Error updating post');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!preview) return;
        if (!confirm('本当にこの投稿を削除しますか？ / Are you sure you want to delete this post?')) return;

        setLoading(true);
        try {
            const { data: deletedData, error: deleteError } = await supabase
                .from('posts')
                .delete()
                .eq('url', preview.url)
                .select('id'); // Request returned rows to verify deletion

            if (deleteError) throw deleteError;
            if (!deletedData || deletedData.length === 0) throw new Error('削除失敗: 権限がないか、投稿が見つかりません (RLS設定を確認してください) / Delete failed: Permission denied or post not found. check RLS policies.');

            // Success state
            setUrl('');
            setPreview(null);
            setEditablePrompt('');
            setIsEditing(false);
            onPostCreated(); // Refresh feed
            alert('投稿を削除しました / Post deleted successfully!');
        } catch (err: any) {
            setError(err.message || 'Error deleting post');
        } finally {
            setLoading(false);
        }
    };

    const handleShare = async () => {
        if (!preview) return;

        setLoading(true);
        try {
            const clientId = getOrCreateClientId();

            // If image preview failed, fallback to canonical thumbnail URL (best guess for future)
            // instead of saving the last failed attempt (e.g. .jpg)
            let finalImageUrl = preview.imageUrl;
            if (previewImageError) {
                const uuidMatch = preview.url.match(/post\/([a-f0-9-]{36})/);
                if (uuidMatch) {
                    finalImageUrl = `https://imagine-public.x.ai/imagine-public/share-videos/${uuidMatch[1]}_thumbnail.jpg`;
                }
            }

            const uuidMatch = preview.url.match(/post\/([a-f0-9-]{36})/);
            const grokUuid = uuidMatch ? uuidMatch[1] : undefined;

            const cleanImageUrl = finalImageUrl.split('?')[0];
            const cleanPreviewUrl = preview.url.split('?')[0];

            const { error: insertError } = await supabase
                .from('posts')
                .insert([
                    {
                        id: grokUuid, // EXPLICITLY SET THE ID TO GROK UUID
                        url: cleanPreviewUrl,
                        prompt: editablePrompt,
                        user_id: clientId, // Use anonymous Client ID
                        video_url: preview.videoUrl ? preview.videoUrl.split('?')[0] : '',
                        image_url: cleanImageUrl,
                        site_name: preview.siteName,
                        title: preview.title,
                        width: 0,
                        height: 0,
                        nsfw: isNsfw
                    }
                ]);

            if (insertError) {
                if (insertError.code === '23505') throw new Error('URLは既に共有されています！ / URL already shared!');
                throw insertError;
            }

            setUrl('');
            setPreview(null);
            setEditablePrompt('');
            setIsNsfw(false);
            onPostCreated();
        } catch (err: any) {
            setError('投稿エラー / ' + (err.message || 'Error sharing post'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto mb-8 relative z-10">
            <div className="bg-gray-900/60 p-4 sm:p-5 rounded-3xl border border-gray-800 backdrop-blur-md shadow-2xl transition-all duration-300">

                {/* 1. URL Input (Always at top) */}
                <form onSubmit={handleAnalyze} className="flex flex-col sm:flex-row gap-2 mb-3">
                    <div className="relative flex-1 group">
                        <input
                            type="url"
                            placeholder="GrokのURLを貼り付け / Paste Grok URL ..."
                            className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-2.5 rounded-2xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all placeholder-gray-500 text-sm shadow-inner"
                            value={url}
                            onChange={(e) => {
                                let inputUrl = e.target.value;
                                try {
                                    const urlObj = new URL(inputUrl);
                                    if (urlObj.hostname === 'grok.com' && urlObj.pathname.startsWith('/imagine/post/')) {
                                        inputUrl = `${urlObj.origin}${urlObj.pathname}`;
                                    }
                                } catch (err) {
                                    // Ignore if not a valid URL yet
                                }
                                setUrl(inputUrl);
                            }}
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading || !url}
                        className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-800 disabled:text-gray-500 text-white px-6 py-2.5 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap shadow-lg active:scale-95 text-sm"
                    >
                        {loading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} fill="currentColor" />}
                        Load
                    </button>
                </form>

                <div className="flex flex-col sm:flex-row gap-4 transition-all duration-500 mt-4 opacity-100">

                    {/* 2. Left Column: Thumbnail Preview */}
                    <div className="w-full sm:w-[120px] shrink-0 animate-in fade-in slide-in-from-left-4 duration-300">
                        <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-gray-900 border border-gray-700/50 shadow-inner group flex flex-col items-center justify-center">
                            {(!preview && !loading) ? (
                                <div className="flex flex-col items-center justify-center gap-2 p-2 text-center opacity-50">
                                    <ImageIcon size={24} className="text-gray-500" />
                                    <p className="text-[10px] text-gray-400 font-bold leading-tight">URLを入れて<br />Load<br />を押してください</p>
                                </div>
                            ) : preview?.imageUrl && !previewImageError ? (
                                <div className="relative w-full h-full cursor-pointer" onClick={() => window.open(preview.url, '_blank')}>
                                    <img
                                        src={preview.imageUrl}
                                        alt="Thumbnail"
                                        referrerPolicy="no-referrer"
                                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                        onError={() => {
                                            console.log("Image load failed, trying fallbacks...");
                                            const currentUrl = preview.imageUrl;
                                            const cleanUrl = currentUrl.split('?')[0];

                                            if (cleanUrl.includes('_thumbnail.jpg')) {
                                                const next = cleanUrl.replace('_thumbnail.jpg', '').replace('/share-videos/', '/share-images/') + '.jpg';
                                                setPreview(prev => prev ? ({ ...prev, imageUrl: next }) : null);
                                            } else if (cleanUrl.includes('/share-images/')) {
                                                const next = cleanUrl.replace('/share-images/', '/share-videos/').replace('.jpg', '.png');
                                                setPreview(prev => prev ? ({ ...prev, imageUrl: next }) : null);
                                            } else if (cleanUrl.endsWith('.png')) {
                                                if (cleanUrl.includes('/share-videos/')) {
                                                    const next = cleanUrl.replace('/share-videos/', '/images/').replace('.png', '.jpg');
                                                    setPreview(prev => prev ? ({ ...prev, imageUrl: next }) : null);
                                                } else {
                                                    setPreviewImageError(true);
                                                }
                                            } else if (cleanUrl.includes('/images/') && cleanUrl.endsWith('.jpg')) {
                                                setPreviewImageError(true);
                                            } else {
                                                setPreviewImageError(true);
                                            }
                                        }}
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-all opacity-0 group-hover:opacity-100">
                                        <div className="bg-white/20 p-2 rounded-full backdrop-blur-md border border-white/30">
                                            <ImageIcon size={16} className="text-white shadow-lg" />
                                        </div>
                                    </div>
                                </div>
                            ) : previewImageError && preview ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950 p-2 text-center">
                                    <Clock size={16} className="text-blue-400 mb-1" />
                                    <p className="font-bold text-gray-200 text-[10px] mb-2 leading-tight">Preview Pending</p>
                                    <div className="w-full space-y-1.5 px-1">
                                        <a
                                            href={preview.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block w-full text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 py-1.5 rounded-lg text-[9px] font-bold border border-blue-500/20 transition-colors"
                                        >
                                            1. 元ページを開く
                                        </a>
                                        <button
                                            onClick={() => {
                                                const uuidMatch = preview.url.match(/post\/([a-f0-9-]{36})/);
                                                if (uuidMatch) {
                                                    const uuid = uuidMatch[1];
                                                    const resetUrl = `https://imagine-public.x.ai/imagine-public/share-videos/${uuid}_thumbnail.jpg?t=${Date.now()}`;
                                                    setPreview(prev => prev ? ({ ...prev, imageUrl: resetUrl }) : null);
                                                } else {
                                                    setPreview(prev => prev ? ({ ...prev, imageUrl: `${prev.imageUrl.split('?')[0]}?t=${Date.now()}` }) : null);
                                                }
                                                setPreviewImageError(false);
                                            }}
                                            className="block w-full text-green-400 bg-green-500/10 hover:bg-green-500/20 py-1.5 rounded-lg text-[9px] font-bold border border-green-500/20 transition-colors"
                                        >
                                            2. 再読み込み
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                                    <Loader2 className="animate-spin text-gray-500" size={24} />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 3. Right Column / Bottom row: Text Area and Actions */}
                    <div className="flex-1 flex flex-col pt-1">
                        <textarea
                            value={editablePrompt}
                            onChange={(e) => setEditablePrompt(e.target.value)}
                            placeholder="プロンプトや説明を入力... / Describe the content or paste the prompt... (Optional)"
                            className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-3 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none h-20 sm:h-28 resize-none transition-all placeholder-gray-500 text-sm leading-relaxed shadow-inner scrollbar-thin scrollbar-thumb-gray-700"
                        />

                        {error && <p className="text-red-400 text-xs mt-2 font-medium">{error}</p>}

                        {/* Bottom Toolbar */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-auto">
                            <label className="flex items-center gap-2 cursor-pointer group hover:bg-red-500/10 px-2 py-1.5 rounded-lg transition-colors ml-1">
                                <input
                                    type="checkbox"
                                    checked={isNsfw}
                                    onChange={(e) => setIsNsfw(e.target.checked)}
                                    className="w-3.5 h-3.5 rounded bg-gray-800 border-gray-600 text-red-500 focus:ring-red-500 focus:ring-offset-gray-900"
                                />
                                <span className="text-xs font-bold text-red-400">
                                    NSFW
                                </span>
                            </label>

                            <div className="flex items-center gap-2 ml-auto">
                                {!preview && (url || editablePrompt || isNsfw) && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setUrl('');
                                            setEditablePrompt('');
                                            setIsNsfw(false);
                                            setError('');
                                        }}
                                        className="text-gray-500 hover:text-gray-300 px-2 py-1 text-xs font-bold flex items-center gap-1 transition-colors"
                                    >
                                        Clear
                                    </button>
                                )}

                                {preview && (
                                    <>
                                        {isEditing && (
                                            <button
                                                type="button"
                                                onClick={handleDelete}
                                                disabled={loading}
                                                className="p-2 bg-red-600/10 hover:bg-red-600 hover:text-white text-red-500 rounded-full transition-all border border-transparent hover:border-red-500 mr-1"
                                                title="投稿を削除 / Delete Post"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => { setPreview(null); setIsEditing(false); }}
                                            disabled={loading}
                                            className="px-4 py-1.5 hover:bg-gray-800 text-gray-400 hover:text-gray-200 rounded-full text-xs font-bold transition-all active:scale-95"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={isEditing ? handleUpdate : handleShare}
                                            disabled={loading}
                                            className={`
                                                px-5 py-1.5 rounded-full text-sm font-bold flex items-center gap-1.5 transition-all outline-none shadow-md shadow-black/20
                                                ${isEditing
                                                    ? 'bg-blue-600 hover:bg-blue-500 text-white'
                                                    : 'bg-green-600 hover:bg-green-500 text-white'
                                                }
                                                ${loading ? 'opacity-50 scale-100' : 'active:scale-95 hover:shadow-lg'}
                                            `}
                                        >
                                            {loading ? <Loader2 className="animate-spin" size={14} /> : null}
                                            {isEditing ? 'Update' : 'Post'}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
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
