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
        setEditablePrompt('');
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
                // setEditableUserId(existingPost.user_id || ''); // Abolished
                setLoading(false);
                return;
            }

            // Construct public URLs
            // Video: https://imagine-public.x.ai/imagine-public/share-videos/[UUID].mp4
            // Image (Thumbnail): https://imagine-public.x.ai/imagine-public/share-videos/[UUID]_thumbnail.jpg
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
                    // user_id: editableUserId.trim() || null, // Abolished: Do not update user_id
                })
                .eq('url', preview.url)
                .select('id');

            if (updateError) throw updateError;
            if (!updatedData || updatedData.length === 0) throw new Error('Update failed: Permission denied or post not found. check RLS policies. / 更新失敗: 権限がないか、投稿が見つかりません (RLS設定を確認してください)');

            // Success state
            setUrl('');
            setPreview(null);
            setEditablePrompt('');
            setIsEditing(false);
            onPostCreated(); // Refresh feed
            alert('Post updated successfully! / 投稿を更新しました');
        } catch (err: any) {
            setError(err.message || 'Error updating post');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!preview) return;
        if (!confirm('Are you sure you want to delete this post? / 本当にこの投稿を削除しますか？')) return;

        setLoading(true);
        try {
            const { data: deletedData, error: deleteError } = await supabase
                .from('posts')
                .delete()
                .eq('url', preview.url)
                .select('id'); // Request returned rows to verify deletion

            if (deleteError) throw deleteError;
            if (!deletedData || deletedData.length === 0) throw new Error('Delete failed: Permission denied or post not found. check RLS policies. / 削除失敗: 権限がないか、投稿が見つかりません (RLS設定を確認してください)');

            // Success state
            setUrl('');
            setPreview(null);
            setEditablePrompt('');
            setIsEditing(false);
            onPostCreated(); // Refresh feed
            alert('Post deleted successfully! / 投稿を削除しました');
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
                        height: 0
                    }
                ]);

            if (insertError) {
                if (insertError.code === '23505') throw new Error('URL already shared!');
                throw insertError;
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
                            {/* User ID Field Removed */}
                            {/* 
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">User ID / ユーザーID</label>
                                <input ... />
                            </div>
                            */}

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
                                {isEditing && (
                                    <button
                                        type="button"
                                        onClick={handleDelete}
                                        disabled={loading}
                                        className="px-4 py-2 text-red-400 hover:text-red-300 transition-colors text-sm flex items-center gap-1 mr-auto"
                                    >
                                        <Trash2 size={16} />
                                        Delete / 削除
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setPreview(null)}
                                    className="px-4 py-2 text-gray-400 hover:text-white transition-colors text-sm"
                                >
                                    Cancel / キャンセル
                                </button>
                                <button
                                    onClick={isEditing ? handleUpdate : handleShare}
                                    disabled={loading}
                                    className={`
                                        px-6 py-2 rounded-lg font-medium flex items-center gap-2 shadow-lg transition-all
                                        ${isEditing
                                            ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/20 text-white'
                                            : 'bg-green-600 hover:bg-green-500 shadow-green-900/20 text-white'
                                        }
                                        ${loading ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:scale-105 active:scale-95'}
                                    `}
                                >
                                    {loading ? <Loader2 className="animate-spin" /> : isEditing ? <RefreshCw size={18} /> : <Plus size={18} />}
                                    {isEditing ? 'Update / 更新する' : 'Share / 投稿する'}
                                </button>
                            </div>
                        </div>

                        {/* Right: Visual Preview */}
                        <div className="w-full max-w-[200px] mx-auto md:max-w-none md:w-48 shrink-0 flex flex-col gap-2">
                            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">Preview</label>
                            <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden bg-black border border-gray-700 shadow-md flex items-center justify-center">

                                {/* Thumbnail Image Only (User requested to prioritize image) */}
                                {preview.imageUrl && !previewImageError ? (
                                    <div className="relative w-full h-full group cursor-pointer" onClick={() => window.open(preview.url, '_blank')}>
                                        <img
                                            src={preview.imageUrl}
                                            alt="Thumbnail"
                                            referrerPolicy="no-referrer"
                                            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
                                            onError={() => {
                                                console.log("Image load failed:", preview.imageUrl);
                                                // Strip query params for logic checks (handling ?t= timestamp)
                                                const cleanUrl = preview.imageUrl.split('?')[0];

                                                // Fallback logic: Try .png if _thumbnail.jpg fails
                                                if (cleanUrl.includes('_thumbnail.jpg')) {
                                                    console.log("Retrying with .png...");
                                                    setPreview(prev => prev ? ({
                                                        ...prev,
                                                        imageUrl: prev.imageUrl.replace('_thumbnail.jpg', '.png')
                                                    }) : null);
                                                } else if (cleanUrl.endsWith('.png')) {
                                                    console.log("Retrying with static .jpg...");
                                                    // Pattern change: /share-videos/UUID.png -> /images/UUID.jpg
                                                    if (cleanUrl.includes('/share-videos/')) {
                                                        setPreview((prev) => prev ? ({
                                                            ...prev,
                                                            imageUrl: prev.imageUrl.replace('/share-videos/', '/images/').replace('.png', '.jpg')
                                                        }) : null);
                                                    } else {
                                                        // If already .jpg or other format, mark as failed
                                                        console.error("All image candidates failed.");
                                                        setPreviewImageError(true);
                                                    }
                                                } else {
                                                    // If already .jpg or other format, mark as failed
                                                    console.error("All image candidates failed.");
                                                    setPreviewImageError(true);
                                                }
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
                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
                                        <div className="flex flex-col gap-3 items-center max-w-[280px]">
                                            <div className="text-gray-400 text-xs leading-relaxed">
                                                <p className="mb-2 text-gray-300 font-medium">No Preview Yet / プレビュー未生成</p>
                                                <p className="mb-1">画像を読み込めませんが投稿は可能です。</p>
                                                <p className="text-[10px] text-gray-500">※Grok側でまだ画像が生成されていない可能性があります。以下の手順で確認できます。</p>
                                            </div>

                                            <div className="w-full bg-gray-800/50 rounded p-2 flex flex-col gap-2">
                                                <a
                                                    href={preview.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center justify-center gap-2 text-blue-400 hover:text-white bg-blue-500/10 hover:bg-blue-500/20 py-1.5 px-3 rounded text-xs transition-colors border border-blue-500/20"
                                                >
                                                    <span className="font-bold">1.</span> Check Original / 元ページを開く
                                                </a>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        // Retry logic:
                                                        // 1. Force image reload by appending/updating timestamp
                                                        // 2. Reset back to CANONICAL thumbnail (not the failed .jpg)
                                                        // 3. Reset error state
                                                        setPreview(prev => {
                                                            if (!prev) return null;

                                                            let newImageUrl = prev.imageUrl;
                                                            // Try to reconstruct canonical thumbnail from post URL UUID
                                                            const uuidMatch = prev.url.match(/post\/([a-f0-9-]{36})/);
                                                            if (uuidMatch) {
                                                                newImageUrl = `https://imagine-public.x.ai/imagine-public/share-videos/${uuidMatch[1]}_thumbnail.jpg`;
                                                            } else {
                                                                // Fallback: just strip query params from current
                                                                newImageUrl = prev.imageUrl.split('?')[0];
                                                            }

                                                            return {
                                                                ...prev,
                                                                imageUrl: `${newImageUrl}?t=${Date.now()}`
                                                            };
                                                        });
                                                        setPreviewImageError(false);
                                                    }}
                                                    className="flex items-center justify-center gap-2 text-green-400 hover:text-white bg-green-500/10 hover:bg-green-500/20 py-1.5 px-3 rounded text-xs transition-colors border border-green-500/20 cursor-pointer"
                                                >
                                                    <span className="font-bold">2.</span> Retry Image / 画像再読み込み
                                                </button>
                                            </div>
                                        </div>
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
