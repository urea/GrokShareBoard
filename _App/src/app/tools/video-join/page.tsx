import type { Metadata } from 'next';
import { VideoJoinTool } from './VideoJoinTool';

export const metadata: Metadata = {
  title: '貼る。並べる。つなぐ。 | Grok動画結合',
  description: 'Grok動画をURLからそのまま1本に。投稿URLを貼って順番を並べるだけで、ブラウザ内でMP4に結合できます。',
  alternates: {
    canonical: '/tools/video-join/',
  },
};

export default function VideoJoinPage() {
  return <VideoJoinTool />;
}
