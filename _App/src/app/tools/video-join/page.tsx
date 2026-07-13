import type { Metadata } from 'next';
import { VideoJoinTool } from './VideoJoinTool';

export const metadata: Metadata = {
  title: 'Grok動画結合 | Grok Share Board',
  description: 'Grokで保存した複数のMP4を、サーバーへ送らずブラウザ内だけで1本に結合します。',
  alternates: {
    canonical: '/tools/video-join/',
  },
};

export default function VideoJoinPage() {
  return <VideoJoinTool />;
}
