'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Comment } from '@/types';
import { MessageSquare, Send, Trash2, Clock, Shield } from 'lucide-react';

interface CommentSectionProps {
    postId: string;
    isAdmin?: boolean;
}

export default function CommentSection({ postId, isAdmin = false }: CommentSectionProps) {
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Retrieve anonymous Client ID (Shared logic with ShareInput)
    const getOrCreateClientId = () => {
        let clientId = localStorage.getItem('grok_share_client_id');
        if (!clientId) {
            clientId = crypto.randomUUID();
            localStorage.setItem('grok_share_client_id', clientId);
        }
        return clientId;
    };

    const fetchComments = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('comments')
                .select('*')
                .eq('post_id', postId)
                .order('created_at', { ascending: true });

            if (error) throw error;
            setComments(data || []);
        } catch (err) {
            console.error('Failed to fetch comments:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchComments();
    }, [postId]);

    const handleAddComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim() || submitting) return;

        setSubmitting(true);
        const clientId = getOrCreateClientId();

        try {
            const { data, error } = await supabase
                .from('comments')
                .insert([
                    {
                        post_id: postId,
                        content: newComment.trim(),
                        client_id: clientId
                    }
                ])
                .select();

            if (error) throw error;

            setComments(prev => [...prev, ...(data || [])]);
            setNewComment('');
        } catch (err) {
            console.error('Failed to add comment:', err);
            alert('Failed to post comment.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteComment = async (commentId: string) => {
        if (!window.confirm('このコメントを削除しますか？ / Delete this comment?')) return;

        try {
            const { error } = await supabase
                .from('comments')
                .delete()
                .eq('id', commentId);

            if (error) throw error;
            setComments(prev => prev.filter(c => c.id !== commentId));
        } catch (err) {
            console.error('Failed to delete comment:', err);
            alert('Failed to delete comment.');
        }
    };

    return (
        <div className="flex flex-col gap-4 mt-6 pt-6 border-t border-gray-800">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-300">
                <MessageSquare size={16} />
                <span>コメント / Comments ({comments.length})</span>
            </div>

            {/* Comment List */}
            <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {loading ? (
                    <div className="text-center py-4 text-gray-500 text-xs">Loading comments...</div>
                ) : comments.length === 0 ? (
                    <div className="text-center py-4 text-gray-500 text-xs italic">まだコメントはありません / No comments yet.</div>
                ) : (
                    comments.map(comment => (
                        <div key={comment.id} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50 group relative">
                            <div className="flex justify-between items-start mb-1">
                                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                    <Clock size={10} />
                                    <span>{new Date(comment.created_at).toLocaleString()}</span>
                                    {isAdmin && (
                                        <span className="text-blue-400 font-mono text-[9px]">ID: {comment.client_id.slice(0, 8)}...</span>
                                    )}
                                </div>
                                {isAdmin && (
                                    <button
                                        onClick={() => handleDeleteComment(comment.id)}
                                        className="text-gray-500 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Delete"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                )}
                            </div>
                            <p className="text-xs text-gray-200 whitespace-pre-wrap break-words leading-relaxed text-balance">
                                {comment.content}
                            </p>
                        </div>
                    ))
                )}
            </div>

            {/* Add Comment Form */}
            <form onSubmit={handleAddComment} className="flex flex-col gap-2 mt-2">
                <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="コメントを入力... / Write a comment..."
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs text-gray-200 focus:outline-none focus:border-blue-500 transition-colors resize-none placeholder:text-gray-600"
                    rows={2}
                    maxLength={1000}
                />
                <div className="flex justify-end gap-2 items-center">
                    <span className="text-[10px] text-gray-600">
                        {newComment.length}/1000
                    </span>
                    <button
                        type="submit"
                        disabled={!newComment.trim() || submitting}
                        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${newComment.trim() && !submitting
                                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20'
                                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                            }`}
                    >
                        {submitting ? '...' : <><Send size={12} /> Post</>}
                    </button>
                </div>
            </form>
        </div>
    );
}
