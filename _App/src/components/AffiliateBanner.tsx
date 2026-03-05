import React from 'react';
import { LifeBuoy, ExternalLink } from 'lucide-react';

const AffiliateBanner: React.FC = () => {
    const widgetContainerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        // Clean up previous scripts if any
        if (widgetContainerRef.current) {
            widgetContainerRef.current.innerHTML = '';
        }

        // Set global parameter function required by the widget
        (window as any).MafRakutenWidgetParam = function () {
            return { size: '468x160', design: 'slide', recommend: 'on', auto_mode: 'on', a_id: '5410287', border: 'off' };
        };

        // Create and inject the widget script
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = 'https://dn.msmstatic.com/site/rakuten/widget.js';
        script.async = true;

        if (widgetContainerRef.current) {
            widgetContainerRef.current.appendChild(script);
        }

        return () => {
            // Clean up global function on unmount
            delete (window as any).MafRakutenWidgetParam;
        };
    }, []);

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
                                継続的な運営のため、右記の商品紹介等を経由したお買い物、または{' '}
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

                {/* Affiliate Widget Area */}
                <div className="bg-white flex items-center justify-center p-1 lg:px-4 min-h-[168px] min-w-[300px] sm:min-w-[480px]">
                    <div ref={widgetContainerRef} className="relative w-full flex justify-center overflow-hidden">
                        {/* Widget will be injected here */}
                        <div className="text-[10px] text-gray-400 animate-pulse">Loading items...</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AffiliateBanner;
