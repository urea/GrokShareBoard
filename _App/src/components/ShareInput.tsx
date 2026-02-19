'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, X, Loader2, Image as ImageIcon, AlertTriangle, Sparkles, RefreshCw, Trash2, Edit } from 'lucide-react';
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
            } catch (e) {
                console.warn("Video detection failed, defaulting to no video.");
            }

            const mockPreview: PreviewData = {
                url: url,
                videoUrl: detectedVideoUrl,
                imageUrl: imageUrl,
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

            const { data: updatedData, error: updateError } = await supabase
                .from('posts')
                .update({
                    prompt: editablePrompt,
                    image_url: finalImageUrl,
                    nsfw: isNsfw,
                    // user_id: editableUserId.trim() || null, // Abolished: Do not update user_id
                })
                .eq('url', preview.url)
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

            const { error: insertError } = await supabase
                .from('posts')
                .insert([
                    {
                        url: preview.url,
                        prompt: editablePrompt,
                        user_id: clientId, // Use anonymous Client ID
                        video_url: preview.videoUrl,
                        image_url: finalImageUrl,
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
        <div className="w-full max-w-2xl mx-auto mb-8 space-y-4">
            {/* 1. Main Input Area (Always Visible) */}
            <div className="bg-gray-900/50 p-6 rounded-2xl border border-gray-800 backdrop-blur-sm space-y-4">
                <form onSubmit={handleAnalyze} className="flex gap-2">
                    <div className="relative flex-1">
                        <input
                            type="url"
                            placeholder="GrokのURLを貼り付け / Paste Grok URL ..."
                            className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder-gray-500"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-lg font-bold transition-all flex items-center gap-2 whitespace-nowrap shadow-md shadow-purple-900/20 active:scale-95 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} fill="currentColor" />}
                        Load
                    </button>
                </form>

                {/* Prompt and NSFW - Now always visible */}
                <div className="space-y-4 pt-2 border-t border-gray-800/50">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                            プロンプト・説明 / Prompt / Description
                        </label>
                        <textarea
                            value={editablePrompt}
                            onChange={(e) => setEditablePrompt(e.target.value)}
                            placeholder="プロンプトや説明を入力... / Describe the content or paste the prompt... (Optional)"
                            className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none transition-all placeholder-gray-500 text-sm"
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 bg-gray-800/40 p-2 rounded-lg border border-gray-700/50 w-fit">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={isNsfw}
                                    onChange={(e) => setIsNsfw(e.target.checked)}
                                    className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-red-600 focus:ring-red-500 focus:ring-offset-gray-900"
                                />
                                <span className={`text-sm font-bold transition-colors ${isNsfw ? 'text-red-400' : 'text-gray-400 group-hover:text-gray-300'}`}>
                                    NSFW作品として投稿 / Mark as NSFW
                                </span>
                            </label>
                        </div>

                        {/* Reset Button (Visible only when there's some input) */}
                        {(url || editablePrompt || isNsfw) && !preview && (
                            <button
                                onClick={() => {
                                    setUrl('');
                                    setEditablePrompt('');
                                    setIsNsfw(false);
                                    setError('');
                                }}
                                className="text-gray-500 hover:text-gray-300 text-xs flex items-center gap-1 transition-colors"
                            >
                                <Trash2 size={12} /> Clear
                            </button>
                        )}
                    </div>
                </div>

                {error && <p className="text-red-400 text-sm animate-pulse">{error}</p>}
            </div>

            {/* 2. Actions & Preview Section (Visible after Load) */}
            {preview && (
                <div className="bg-gray-900/50 p-6 rounded-2xl border border-gray-800 backdrop-blur-sm animate-in fade-in slide-in-from-top-4">
                    <div className="flex flex-col md:flex-row gap-6 items-start">

                        {/* Preview Image */}
                        <div className="w-full md:w-48 shrink-0 space-y-2">
                            <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-widest">Preview</label>
                            <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden bg-black border border-gray-700 shadow-xl group">
                                {preview.imageUrl && !previewImageError ? (
                                    <div className="relative w-full h-full cursor-pointer" onClick={() => window.open(preview.url, '_blank')}>
                                        <img
                                            src={preview.imageUrl}
                                            alt="Thumbnail"
                                            referrerPolicy="no-referrer"
                                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                            onError={() => {
                                                console.log("Image load failed, trying fallbacks...");
                                                const cleanUrl = preview.imageUrl.split('?')[0];
                                                if (cleanUrl.includes('_thumbnail.jpg')) {
                                                    setPreview(prev => prev ? ({ ...prev, imageUrl: prev.imageUrl.replace('_thumbnail.jpg', '.png') }) : null);
                                                } else if (cleanUrl.endsWith('.png')) {
                                                    if (cleanUrl.includes('/share-videos/')) {
                                                        setPreview(prev => prev ? ({ ...prev, imageUrl: prev.imageUrl.replace('/share-videos/', '/images/').replace('.png', '.jpg') }) : null);
                                                    } else {
                                                        setPreviewImageError(true);
                                                    }
                                                } else {
                                                    setPreviewImageError(true);
                                                }
                                            }}
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-all opacity-0 group-hover:opacity-100">
                                            <div className="bg-white/20 p-2 rounded-full backdrop-blur-md border border-white/30">
                                                <ImageIcon size={20} className="text-white shadow-lg" />
                                            </div>
                                        </div>
                                    </div>
                                ) : previewImageError ? (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950 p-4 text-center">
                                        <AlertTriangle size={24} className="text-yellow-600 mb-2" />
                                        <p className="text-[10px] text-gray-500 leading-tight">プレビュー未生成ですが<br />投稿は可能です</p>
                                    </div>
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center bg-gray-950">
                                        <Loader2 className="animate-spin text-gray-600" />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex-1 w-full space-y-6 self-stretch flex flex-col justify-center">
                            <div className="space-y-2">
                                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                    {isEditing ? <Edit size={16} className="text-blue-400" /> : <Sparkles size={16} className="text-green-400" />}
                                    {isEditing ? '投稿を編集 / Editing Post' : '投稿の準備ができました / Ready to Share'}
                                </h4>
                                <p className="text-xs text-gray-400 leading-relaxed">
                                    {isEditing
                                        ? 'プロンプトやNSFW設定を更新して保存してください。'
                                        : 'プレビューを確認し、問題なければShareボタンを押して公開してください。'}
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-3">
                                <button
                                    onClick={isEditing ? handleUpdate : handleShare}
                                    disabled={loading}
                                    className={`
                                        flex-1 min-w-[120px] px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-all
                                        ${isEditing
                                            ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/30 text-white'
                                            : 'bg-green-600 hover:bg-green-500 shadow-green-900/30 text-white'
                                        }
                                        ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 active:scale-95'}
                                    `}
                                >
                                    {loading ? <Loader2 className="animate-spin" /> : isEditing ? <RefreshCw size={18} /> : <Plus size={18} />}
                                    {isEditing ? 'Update' : 'Share Now'}
                                </button>

                                {isEditing ? (
                                    <button
                                        type="button"
                                        onClick={handleDelete}
                                        disabled={loading}
                                        className="px-6 py-3 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-600/30 rounded-xl font-bold transition-all flex items-center gap-2"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setPreview(null);
                                            setIsEditing(false);
                                        }}
                                        disabled={loading}
                                        className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-bold transition-all border border-gray-700 active:scale-95"
                                    >
                                        Cancel
                                    </button>
                                )}
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
