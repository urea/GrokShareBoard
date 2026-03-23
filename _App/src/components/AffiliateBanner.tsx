import React from 'react';
import { LifeBuoy, ExternalLink } from 'lucide-react';

const AffiliateBanner: React.FC = () => {
    // Using a separate static HTML file in /public is the most robust way to embed legacy ad scripts
    return (
        <div className="mb-6 bg-[#252525]/30 border border-gray-800 rounded-md overflow-hidden shadow-sm">
            <div className="flex flex-col xl:flex-row items-stretch">
                {/* Support Message */}
                <div className="flex-1 p-3 px-4 flex flex-col justify-center border-b xl:border-b-0 xl:border-r border-gray-800">
                    <div className="flex items-start gap-3">
                        <LifeBuoy size={14} className="text-[#0099cc] mt-0.5 shrink-0" />
                        <div className="text-[11px] leading-relaxed text-gray-400">
                            <p className="text-gray-200 font-bold mb-1">【運営よりご協力のお願い】</p>
                            <p>
                                サーバー維持費の補填のため、止むを得ず広告の掲載を開始いたしました。
                                継続的な運営のため、右記（または下記）のスポンサー広告へのご関心、あるいは{' '}
                                <a
                                    href="https://note.com/limber_lynx1258/n/n700edc6393f1"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[#0099cc] hover:underline font-bold inline-flex items-center gap-0.5"
                                >
                                    公式note（記事最下部のチップボタン） <ExternalLink size={10} />
                                </a>{' '}
                                からのご支援をいただけますと幸いです。
                            </p>
                            <p className="mt-1">
                                また、当サイトをSNS（X/TwitterやNote等）でご紹介いただけますと、運営の大きな励みになります。より多くの方に知っていただけるよう、ぜひ宣伝へのご協力もお願いいたします。
                            </p>
                            <p className="mt-1 opacity-70">
                                不具合報告や要望はnoteのコメント欄へお寄せください。皆様と一緒にサイトを改善していければ嬉しいです。
                            </p>
                        </div>
                    </div>
                </div>

                {/* Affiliate Widget Area (Responsive PC/SP Switch) */}
                <div className="bg-white flex flex-col items-center justify-center p-2 xl:px-4 overflow-hidden shrink-0">
                    
                    {/* PC View (728x90) - Only visible on md (768px) and above */}
                    <div className="hidden md:flex items-center justify-center min-w-[728px] min-h-[90px] w-full">
                        <iframe
                            src="ninja-admax-pc.html"
                            width="728"
                            height="90"
                            frameBorder="0"
                            scrolling="no"
                            title="Ninja AdMax PC Display"
                            className="w-[728px] h-[90px] object-contain"
                            allow="payment; publickey-credentials-get"
                        />
                    </div>

                    {/* SP/Mobile View (320x100) - Only visible below md (768px) */}
                    <div className="flex md:hidden items-center justify-center min-w-[320px] min-h-[100px] w-full">
                        <iframe
                            src="ninja-admax-sp.html"
                            width="320"
                            height="100"
                            frameBorder="0"
                            scrolling="no"
                            title="Ninja AdMax SP Display"
                            className="w-[320px] h-[100px] object-contain"
                            allow="payment; publickey-credentials-get"
                        />
                    </div>

                </div>
            </div>
        </div>
    );
};

export default AffiliateBanner;
