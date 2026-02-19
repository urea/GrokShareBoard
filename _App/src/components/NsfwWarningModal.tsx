import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

interface NsfwWarningModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

const NsfwWarningModal: React.FC<NsfwWarningModalProps> = ({ isOpen, onClose, onConfirm }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="relative w-full max-w-lg bg-[#1a1a1a] border border-red-900/50 rounded-2xl shadow-2xl overflow-hidden"
                    >
                        {/* Header with Icon */}
                        <div className="bg-red-950/30 p-6 flex items-center gap-4 border-b border-white/5">
                            <div className="p-3 bg-red-500/20 rounded-full text-red-500">
                                <AlertTriangle size={32} />
                            </div>
                            <h2 className="text-xl font-bold text-white">
                                NSFWモードに切り替えたいですか？
                            </h2>
                            <button
                                onClick={onClose}
                                className="ml-auto p-2 text-gray-500 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-8 space-y-4">
                            <p className="text-gray-300 leading-relaxed text-sm">
                                これより先は、18歳以上の方を対象とした成人向けコンテンツ（露出、性的な表現等）が含まれます。
                            </p>
                            <div className="p-4 bg-black/40 rounded-xl border border-white/5 space-y-3">
                                <p className="text-gray-400 text-xs leading-relaxed italic">
                                    「表示する」を選択することで、以下の事項に同意したものとみなされます：
                                </p>
                                <ul className="text-gray-300 text-xs space-y-2 list-disc pl-4">
                                    <li>私は18歳以上（高校生を除く）です。</li>
                                    <li>公共の場ではない、適切な環境で閲覧しています。</li>
                                    <li>18歳未満の方の目に触れないよう配慮することを誓います。</li>
                                </ul>
                            </div>
                        </div>

                        {/* Footer Buttons */}
                        <div className="p-6 bg-black/20 flex flex-col sm:flex-row gap-3">
                            <button
                                onClick={onClose}
                                className="flex-1 px-6 py-3 bg-[#2a2a2a] text-gray-300 font-bold rounded-xl hover:bg-[#333] transition-all border border-white/5"
                            >
                                キャンセル / Cancel
                            </button>
                            <button
                                onClick={() => {
                                    onConfirm();
                                    onClose();
                                }}
                                className="flex-1 px-6 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-500 shadow-lg shadow-red-900/20 transition-all"
                            >
                                表示する / Enter NSFW
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default NsfwWarningModal;
