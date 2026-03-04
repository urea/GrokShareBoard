import React from 'react';
import { LifeBuoy, ExternalLink } from 'lucide-react';

const AffiliateBanner: React.FC = () => {
    return (
        <div className="mb-6 bg-[#252525]/30 border border-gray-800 rounded-md overflow-hidden shadow-sm">
            <div className="flex flex-col lg:flex-row items-stretch">
                {/* Support Message */}
                <div className="flex-1 p-3 px-4 flex flex-col justify-center border-b lg:border-b-0 lg:border-r border-gray-800">
                    <div className="flex items-start gap-3">
                        <LifeBuoy size={14} className="text-[#0099cc] mt-0.5 shrink-0" />
                        <div className="text-[11px] leading-relaxed text-gray-400">
                            <p className="text-gray-200 font-bold mb-1">【運営よりご協力のお願い】</p>
                            <p>
                                サーバー維持費の補填のため、止むを得ず広告の掲載を開始いたしました。
                                継続的な運営のため、右記バナー等を経由したお買い物、または{' '}
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
                            <p className="mt-1 opacity-70">
                                不具合報告や要望はnoteのコメント欄へお寄せください。皆様と一緒にサイトを改善していければ嬉しいです。
                            </p>
                        </div>
                    </div>
                </div>

                {/* Affiliate Banner Area */}
                <div className="bg-white flex items-center justify-center p-1 lg:px-6 min-h-[68px]">
                    <div className="relative">
                        <a
                            href="//af.moshimo.com/af/c/click?a_id=5410287&p_id=54&pc_id=54&pl_id=620"
                            rel="nofollow"
                            referrerPolicy="no-referrer-when-downgrade"
                            target="_blank"
                            className="block"
                        >
                            <img
                                src="//image.moshimo.com/af-img/0032/000000000620.gif"
                                width="468"
                                height="60"
                                style={{ border: 'none' }}
                                alt="楽天市場"
                                className="max-w-full h-[60px] object-contain"
                            />
                        </a>
                        <img
                            src="//i.moshimo.com/af/i/impression?a_id=5410287&p_id=54&pc_id=54&pl_id=620"
                            width="1"
                            height="1"
                            style={{ border: 'none' }}
                            loading="lazy"
                            alt=""
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AffiliateBanner;
