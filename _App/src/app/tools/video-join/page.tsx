import type { Metadata } from 'next';
import { VideoJoinTool } from './VideoJoinTool';

export const metadata: Metadata = {
  title: 'Grok動画結合 | Grok Share Board',
  description: '複数のGrok投稿URLから動画を自動取得し、ブラウザ内で1本のMP4に結合します。',
  alternates: {
    canonical: '/tools/video-join/',
  },
};

export default function VideoJoinPage() {
  return <VideoJoinTool />;
}
