'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { DragEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FFmpeg } from '@ffmpeg/ffmpeg';
import {
  buildGrokPlayableVideoUrl,
  extractGrokPostId,
  isResolvedGrokVideo,
  resolveGrokMedia,
} from '@/lib/grokMedia';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  CircleHelp,
  Clapperboard,
  Combine,
  Download,
  GripVertical,
  HardDriveDownload,
  ListVideo,
  LoaderCircle,
  LockKeyhole,
  MousePointerClick,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import videoJoinGuide from './video-join-guide.png';

const FFMPEG_CORE_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
const GROK_URL_SESSION_KEY = 'grok-video-join.urls.v1';
interface LocalVideo {
  id: string;
  postId: string;
  file: File;
  duration: number | null;
  width: number | null;
  height: number | null;
}

interface GrokVideoItem {
  postId: string;
  url: string;
}

interface JoinOutput {
  url: string;
  fileName: string;
  size: number;
  mode: 'copy' | 'transcode';
}

type ProcessingPhase =
  | 'idle'
  | 'downloading'
  | 'loading-engine'
  | 'preparing'
  | 'joining'
  | 'transcoding'
  | 'ready'
  | 'error';

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return '時間不明';
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  return minutes > 0 ? `${minutes}:${remaining.toString().padStart(2, '0')}` : `${remaining}秒`;
}

function createOutputFileName() {
  const now = new Date();
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `grok-joined-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.mp4`;
}

function normalizeGrokUrl(value: string) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/imagine\/post\/([a-f0-9-]{36})\/?$/i);
    if (url.protocol !== 'https:' || url.hostname !== 'grok.com' || !match) return null;
    return `https://grok.com/imagine/post/${match[1].toLowerCase()}`;
  } catch {
    return null;
  }
}

function parseGrokUrls(value: string) {
  const tokens = value.split(/[\s,]+/).map((token) => token.trim()).filter(Boolean);
  const valid = Array.from(new Set(tokens.map(normalizeGrokUrl).filter((url): url is string => Boolean(url))));
  return { valid, invalidCount: tokens.length - valid.length };
}

function readVideoMetadata(file: File): Promise<Pick<LocalVideo, 'duration' | 'width' | 'height'>> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';

    const finish = (metadata: Pick<LocalVideo, 'duration' | 'width' | 'height'>) => {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute('src');
      video.load();
      resolve(metadata);
    };

    video.onloadedmetadata = () => {
      finish({
        duration: Number.isFinite(video.duration) ? video.duration : null,
        width: video.videoWidth || null,
        height: video.videoHeight || null,
      });
    };
    video.onerror = () => finish({ duration: null, width: null, height: null });
    video.src = objectUrl;
  });
}

export function VideoJoinTool() {
  const [grokUrlText, setGrokUrlText] = useState('');
  const [grokItems, setGrokItems] = useState<GrokVideoItem[]>([]);
  const [videos, setVideos] = useState<LocalVideo[]>([]);
  const [phase, setPhase] = useState<ProcessingPhase>('idle');
  const [statusMessage, setStatusMessage] = useState('複数のGrok動画URLを追加すると結合できます。');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [isUrlDragging, setIsUrlDragging] = useState(false);
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [previewErrorIds, setPreviewErrorIds] = useState<Set<string>>(() => new Set());
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [output, setOutput] = useState<JoinOutput | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const ffmpegAssetUrlsRef = useRef<string[]>([]);
  const outputUrlRef = useRef<string | null>(null);
  const grokUrlTextareaRef = useRef<HTMLTextAreaElement>(null);

  const totalBytes = useMemo(() => videos.reduce((sum, video) => sum + video.file.size, 0), [videos]);
  const totalDuration = useMemo(
    () => videos.reduce((sum, video) => sum + (video.duration ?? 0), 0),
    [videos],
  );
  const isBusy = phase === 'downloading' || phase === 'loading-engine' || phase === 'preparing' || phase === 'joining' || phase === 'transcoding';

  const releaseOutput = () => {
    if (outputUrlRef.current) {
      URL.revokeObjectURL(outputUrlRef.current);
      outputUrlRef.current = null;
    }
    setOutput(null);
  };

  const releaseEngine = () => {
    ffmpegRef.current?.terminate();
    ffmpegRef.current = null;
    ffmpegAssetUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    ffmpegAssetUrlsRef.current = [];
  };

  useEffect(() => {
    return () => {
      if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
      ffmpegRef.current?.terminate();
      ffmpegAssetUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    const savedUrls = sessionStorage.getItem(GROK_URL_SESSION_KEY);
    if (!savedUrls) return;
    const parsed = parseGrokUrls(savedUrls);
    const frameId = requestAnimationFrame(() => setGrokItems(parsed.valid.map((url) => ({ url, postId: extractGrokPostId(url)! }))));
    return () => cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    grokItems.forEach((item) => {
      void resolveGrokMedia(item.postId, controller.signal)
        .then((media) => {
          const playableUrl = isResolvedGrokVideo(media) ? buildGrokPlayableVideoUrl(media) : null;
          if (!playableUrl) throw new Error('This Grok post does not contain a public video.');
          setPreviewUrls((current) => ({ ...current, [item.postId]: playableUrl }));
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setPreviewErrorIds((current) => new Set(current).add(item.postId));
        });
    });

    return () => controller.abort();
  }, [grokItems]);

  useEffect(() => {
    if (!isGuideOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsGuideOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isGuideOpen]);

  const persistGrokItems = (items: GrokVideoItem[]) => {
    if (items.length > 0) {
      sessionStorage.setItem(GROK_URL_SESSION_KEY, items.map((item) => item.url).join('\n'));
    } else {
      sessionStorage.removeItem(GROK_URL_SESSION_KEY);
    }
  };

  const addGrokUrls = (value: string) => {
    const parsed = parseGrokUrls(value);
    if (parsed.valid.length === 0) {
      setErrorMessage('Grok投稿URLを認識できませんでした。');
      return;
    }
    releaseOutput();
    setVideos([]);
    setPhase('idle');
    setProgress(0);
    setStatusMessage('上から順に結合します。サムネイルと順番を確認してください。');
    setErrorMessage(parsed.invalidCount > 0 ? `認識できない入力を${parsed.invalidCount}件除外しました。` : '');
    setGrokItems((current) => {
      const known = new Set(current.map((item) => item.postId));
      const additions = parsed.valid
        .map((url) => ({ url, postId: extractGrokPostId(url)! }))
        .filter((item) => !known.has(item.postId));
      const next = [...current, ...additions];
      persistGrokItems(next);
      return next;
    });
    setGrokUrlText('');
  };

  const handleUrlDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsUrlDragging(false);
    const value = event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain');
    addGrokUrls(value);
  };

  const reorderVideo = (index: number, destination: number) => {
    if (destination < 0 || destination >= grokItems.length || isBusy) return;
    releaseOutput();
    setGrokItems((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(destination, 0, item);
      persistGrokItems(next);
      setVideos([]);
      return next;
    });
  };

  const moveVideo = (index: number, offset: -1 | 1) => reorderVideo(index, index + offset);

  const removeVideo = (postId: string) => {
    if (isBusy) return;
    releaseOutput();
    setVideos((current) => current.filter((video) => video.postId !== postId));
    setPreviewUrls((current) => {
      const next = { ...current };
      delete next[postId];
      return next;
    });
    setPreviewErrorIds((current) => {
      if (!current.has(postId)) return current;
      const next = new Set(current);
      next.delete(postId);
      return next;
    });
    setGrokItems((current) => {
      const next = current.filter((item) => item.postId !== postId);
      persistGrokItems(next);
      return next;
    });
    setPhase('idle');
    setProgress(0);
    setStatusMessage('上から順に結合します。順番を確認してください。');
  };

  const loadFfmpeg = async () => {
    if (ffmpegRef.current?.loaded) return ffmpegRef.current;

    setPhase('loading-engine');
    setProgress(25);
    setStatusMessage('初回のみ、FFmpeg処理エンジン（約32MB）を読み込んでいます…');

    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
      import('@ffmpeg/ffmpeg'),
      import('@ffmpeg/util'),
    ]);
    const ffmpeg = new FFmpeg();
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
      toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    ]);
    ffmpegAssetUrlsRef.current = [coreURL, wasmURL];
    try {
      await ffmpeg.load({ coreURL, wasmURL });
      ffmpegRef.current = ffmpeg;
      return ffmpeg;
    } catch (error) {
      ffmpeg.terminate();
      ffmpegAssetUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      ffmpegAssetUrlsRef.current = [];
      throw error;
    }
  };

  const deleteVirtualFiles = async (ffmpeg: FFmpeg, paths: string[]) => {
    await Promise.all(paths.map(async (path) => {
      try {
        await ffmpeg.deleteFile(path);
      } catch {
        // A failed command may not have created every planned file.
      }
    }));
  };

  const hasAudioStream = async (ffmpeg: FFmpeg, inputPath: string) => {
    const result = await ffmpeg.exec([
      '-hide_banner',
      '-i', inputPath,
      '-map', '0:a:0',
      '-c', 'copy',
      '-f', 'null',
      '-',
    ]);
    return result === 0;
  };

  const fetchGrokVideos = async () => {
    setPhase('downloading');
    setVideos([]);
    setProgress(0);

    const downloaded: LocalVideo[] = [];
    for (let index = 0; index < grokItems.length; index += 1) {
      const item = grokItems[index];
      setStatusMessage(`動画を取得しています（${index + 1}/${grokItems.length}）…`);
      const resolvedMedia = await resolveGrokMedia(item.postId);
      const playableUrl = isResolvedGrokVideo(resolvedMedia)
        ? buildGrokPlayableVideoUrl(resolvedMedia)
        : null;
      if (!playableUrl) {
        throw new Error(`動画${index + 1}はGrokの動画投稿として確認できませんでした。`);
      }

      const response = await fetch(playableUrl, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`動画${index + 1}を取得できませんでした。Grokの個別ページで公開状態を確認してから、もう一度お試しください。`);
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().startsWith('video/mp4')) {
        throw new Error(`動画${index + 1}からMP4を取得できませんでした。`);
      }

      const blob = await response.blob();
      if (blob.size < 1024) {
        throw new Error(`動画${index + 1}を正しく取得できませんでした。`);
      }

      const file = new File([blob], `${item.postId}.mp4`, { type: 'video/mp4' });
      const metadata = await readVideoMetadata(file);
      downloaded.push({ id: item.postId, postId: item.postId, file, ...metadata });
      setVideos([...downloaded]);
      setProgress(Math.round(((index + 1) / grokItems.length) * 25));
    }

    return downloaded;
  };

  const joinVideos = async () => {
    if (grokItems.length < 2 || isBusy) return;

    releaseOutput();
    setErrorMessage('');
    setProgress(0);
    const inputPaths = grokItems.map((_, index) => `input-${index.toString().padStart(2, '0')}.mp4`);
    const normalizedPaths = grokItems.map((_, index) => `normalized-${index.toString().padStart(2, '0')}.mp4`);
    const listPath = 'join-list.txt';
    const normalizedListPath = 'normalized-list.txt';
    const outputPath = 'joined-output.mp4';
    let ffmpeg: FFmpeg | null = null;
    let sourceVideos: LocalVideo[] = [];

    try {
      sourceVideos = await fetchGrokVideos();
      ffmpeg = await loadFfmpeg();
      const { fetchFile } = await import('@ffmpeg/util');
      let progressBase = 0;
      let progressRange = 100;
      const onProgress = ({ progress: nextProgress }: { progress: number }) => {
        if (!Number.isFinite(nextProgress)) return;
        setProgress(Math.max(0, Math.min(99, Math.round(progressBase + nextProgress * progressRange))));
      };
      ffmpeg.on('progress', onProgress);

      try {
        setPhase('preparing');
        for (let index = 0; index < sourceVideos.length; index += 1) {
          setStatusMessage(`動画をブラウザ内の作業領域へ準備しています（${index + 1}/${sourceVideos.length}）…`);
          await ffmpeg.writeFile(inputPaths[index], await fetchFile(sourceVideos[index].file));
          setProgress(25 + Math.round(((index + 1) / sourceVideos.length) * 15));
        }
        await ffmpeg.writeFile(listPath, inputPaths.map((path) => `file '${path}'`).join('\n'));

        setStatusMessage('動画形式の互換性を確認しています…');
        const audioPresence: boolean[] = [];
        for (let index = 0; index < inputPaths.length; index += 1) {
          audioPresence.push(await hasAudioStream(ffmpeg, inputPaths[index]));
        }
        const firstDimensions = `${sourceVideos[0].width ?? 'unknown'}x${sourceVideos[0].height ?? 'unknown'}`;
        const sameDimensions = sourceVideos.every((video) => `${video.width ?? 'unknown'}x${video.height ?? 'unknown'}` === firstDimensions);
        const sameAudioPresence = audioPresence.every((hasAudio) => hasAudio === audioPresence[0]);
        const canStreamCopy = sameDimensions && sameAudioPresence;

        let mode: JoinOutput['mode'] = 'copy';
        let result = 1;
        if (canStreamCopy) {
          setPhase('joining');
          setProgress(40);
          setStatusMessage('画質を変えずに高速結合しています…');
          progressBase = 40;
          progressRange = 55;
          result = await ffmpeg.exec([
            '-hide_banner',
            '-f', 'concat',
            '-safe', '0',
            '-i', listPath,
            '-map', '0:v:0',
            '-map', '0:a?',
            '-c', 'copy',
            '-movflags', '+faststart',
            outputPath,
          ]);
        }

        if (result !== 0) {
          await deleteVirtualFiles(ffmpeg, [outputPath]);
          mode = 'transcode';
          setPhase('transcoding');
          setProgress(40);
          const targetWidth = Math.max(2, Math.floor((sourceVideos[0].width ?? 720) / 2) * 2);
          const targetHeight = Math.max(2, Math.floor((sourceVideos[0].height ?? 1280) / 2) * 2);
          const anyAudio = audioPresence.some(Boolean);

          for (let index = 0; index < inputPaths.length; index += 1) {
            setStatusMessage(`動画形式を揃えています（${index + 1}/${inputPaths.length}）。数分かかる場合があります…`);
            progressBase = 40 + Math.round((index / inputPaths.length) * 50);
            progressRange = 50 / inputPaths.length;
            const hasAudio = audioPresence[index];
            const duration = Math.max(0.1, sourceVideos[index].duration ?? 1);
            const args = ['-hide_banner', '-i', inputPaths[index]];
            if (anyAudio && !hasAudio) {
              args.push('-f', 'lavfi', '-t', duration.toFixed(3), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
            }
            args.push(
              '-map', '0:v:0',
              ...(anyAudio ? ['-map', hasAudio ? '0:a:0' : '1:a:0'] : ['-an']),
              '-vf', `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`,
              '-c:v', 'libx264',
              '-preset', 'veryfast',
              '-crf', '23',
              '-pix_fmt', 'yuv420p',
            );
            if (anyAudio) {
              args.push('-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '128k', '-shortest');
            }
            args.push('-movflags', '+faststart', normalizedPaths[index]);
            const normalizeResult = await ffmpeg.exec(args);
            if (normalizeResult !== 0) {
              throw new Error(`${sourceVideos[index].file.name}を互換MP4へ変換できませんでした。`);
            }
          }

          await ffmpeg.writeFile(normalizedListPath, normalizedPaths.map((path) => `file '${path}'`).join('\n'));
          setStatusMessage('変換した動画を1本へまとめています…');
          progressBase = 90;
          progressRange = 9;
          result = await ffmpeg.exec([
            '-hide_banner',
            '-f', 'concat',
            '-safe', '0',
            '-i', normalizedListPath,
            '-map', '0:v:0',
            '-map', '0:a?',
            '-c', 'copy',
            '-movflags', '+faststart',
            outputPath,
          ]);
        }

        if (result !== 0) {
          throw new Error('この動画の組み合わせを結合できませんでした。解像度や形式が大きく異なる可能性があります。');
        }

        const data = await ffmpeg.readFile(outputPath);
        if (typeof data === 'string' || data.byteLength < 1024) {
          throw new Error('完成動画を正しく作成できませんでした。');
        }

        const blob = new Blob([Uint8Array.from(data)], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        outputUrlRef.current = url;
        setOutput({
          url,
          fileName: createOutputFileName(),
          size: blob.size,
          mode,
        });
        setProgress(100);
        setPhase('ready');
        setStatusMessage('結合が完了しました。完成MP4を保存してください。');
      } finally {
        ffmpeg.off('progress', onProgress);
      }
    } catch (error) {
      console.error('Local video join failed:', error);
      setPhase('error');
      setProgress(0);
      setErrorMessage(error instanceof Error ? error.message : '動画結合中にエラーが発生しました。');
      setStatusMessage('結合を完了できませんでした。');
    } finally {
      if (ffmpeg) {
        await deleteVirtualFiles(ffmpeg, [...inputPaths, ...normalizedPaths, listPath, normalizedListPath, outputPath]);
      }
    }
  };

  const clearSession = () => {
    if (isBusy) return;
    releaseOutput();
    releaseEngine();
    sessionStorage.removeItem(GROK_URL_SESSION_KEY);
    setGrokUrlText('');
    setGrokItems([]);
    setPreviewErrorIds(new Set());
    setPreviewUrls({});
    setVideos([]);
    setPhase('idle');
    setProgress(0);
    setErrorMessage('');
    setStatusMessage('複数のGrok動画URLを追加すると結合できます。');
  };

  const focusUrlInput = () => {
    grokUrlTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => grokUrlTextareaRef.current?.focus(), 350);
  };

  return (
    <div className="min-h-screen bg-[#171717] text-gray-100">
      <header className="border-b border-cyan-300/20 bg-[#0099cc] shadow-lg shadow-black/20">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-3 sm:px-5">
          <Link href="/" className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold text-white/90 transition hover:bg-white/10 hover:text-white">
            <ArrowLeft size={18} />
            <span className="hidden sm:inline">GrokShareBoardへ戻る</span>
            <span className="sm:hidden">戻る</span>
          </Link>
          <div className="flex items-center gap-2 text-white">
            <Clapperboard size={20} />
            <span className="font-bold tracking-wide">Grok Video Join</span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-5 sm:py-7">
        <section className="mb-5 overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-[#12303b] via-[#20252a] to-[#222] p-4 shadow-xl shadow-black/20 sm:p-5">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px] md:items-center lg:grid-cols-[minmax(0,1fr)_300px]">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100">
                <LockKeyhole size={14} /> 3-STEP VIDEO JOIN
              </div>
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">貼る。並べる。つなぐ。</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-300">
                <span className="font-bold text-white">Grok動画を、URLからそのまま1本に。</span> 個別ダウンロードも、ファイルの選び直しも不要です。
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" onClick={focusUrlInput} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-black text-[#10232a] transition hover:bg-cyan-300">
                  <MousePointerClick size={17} /> URLを貼って結合を始める
                </button>
                <span className="text-xs text-gray-400">件数・容量の固定上限なし・初回エンジン約32MB</span>
              </div>
            </div>
            <button type="button" onClick={() => setIsGuideOpen(true)} className="group relative overflow-hidden rounded-xl border border-cyan-300/25 bg-black/30 text-left shadow-lg transition hover:border-cyan-300/60 hover:shadow-cyan-950/40" aria-label="3ステップの使い方画像を拡大表示">
              <Image src={videoJoinGuide} alt="Grok動画結合の3ステップ" className="h-auto w-full transition duration-300 group-hover:scale-[1.02]" priority />
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-black/75 px-3 py-2 text-xs font-bold text-white backdrop-blur-sm">
                <CircleHelp size={15} className="text-cyan-300" /> 画像で使い方を見る
              </span>
            </button>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <section className="rounded-xl border border-gray-700 bg-[#222] p-4 shadow-lg shadow-black/10 sm:p-5">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-sm font-black text-white">1</div>
                <div>
                  <h2 className="font-bold text-white">URLを貼る</h2>
                  <p className="mt-1 text-xs leading-5 text-gray-400">Grok投稿URLをドロップ、または改行区切りでまとめて貼り付けます。</p>
                </div>
              </div>
              <div
                onDragEnter={(event) => { event.preventDefault(); if (!isBusy) setIsUrlDragging(true); }}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}
                onDragLeave={(event) => { if (event.currentTarget === event.target) setIsUrlDragging(false); }}
                onDrop={handleUrlDrop}
                className={`rounded-xl border-2 border-dashed p-4 transition ${isUrlDragging ? 'border-cyan-400 bg-cyan-400/10' : 'border-gray-600 bg-[#191919]'}`}
              >
                <UploadCloud className="mx-auto mb-2 text-cyan-400" size={30} />
                <p className="mb-3 text-center text-sm font-bold text-white">Grokのリンクをここへドロップ</p>
                <textarea ref={grokUrlTextareaRef} value={grokUrlText} onChange={(event) => setGrokUrlText(event.target.value)} disabled={isBusy} rows={3} placeholder={'またはGrok投稿URLを貼り付け（改行区切りで複数指定できます）\nhttps://grok.com/imagine/post/...\nhttps://grok.com/imagine/post/...'} className="w-full resize-y rounded-lg border border-gray-600 bg-[#111] px-3 py-2.5 text-sm text-gray-100 outline-none placeholder:text-gray-600 focus:border-cyan-500" aria-label="Grok動画URL" />
                <p className="mt-2 text-xs text-gray-500">複数のGrok投稿URLは、1行に1件ずつまとめて追加できます。処理可能な量はPC環境によります。</p>
                <button type="button" onClick={() => addGrokUrls(grokUrlTextareaRef.current?.value ?? '')} disabled={isBusy || !grokUrlText.trim()} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-cyan-500 disabled:opacity-40">
                  <Download size={16} /> 結合リストへ追加
                </button>
              </div>
            </section>

            <section className="rounded-xl border border-gray-700 bg-[#222] p-4 shadow-lg shadow-black/10 sm:p-5">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-sm font-black text-white">2</div>
                <div>
                  <h2 className="font-bold text-white">順番を並べる</h2>
                  <p className="mt-1 text-xs leading-5 text-gray-400">サムネイルを確認し、ドラッグまたは矢印で結合順を決めます。</p>
                </div>
              </div>
              {grokItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-700 bg-[#191919] px-4 py-8 text-center text-sm text-gray-500">先にGrok動画URLを追加してください。</div>
              ) : (
                <div className="space-y-3">
                  {grokItems.map((item, index) => (
                      <div
                        key={item.postId}
                        draggable={!isBusy}
                        onDragStart={() => setDraggedItemIndex(index)}
                        onDragOver={(event) => { if (draggedItemIndex !== null) event.preventDefault(); }}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (draggedItemIndex !== null && draggedItemIndex !== index) reorderVideo(draggedItemIndex, index);
                          setDraggedItemIndex(null);
                        }}
                        onDragEnd={() => setDraggedItemIndex(null)}
                        className={`overflow-hidden rounded-xl border bg-[#191919] transition ${draggedItemIndex === index ? 'border-cyan-400 opacity-60' : 'border-gray-700'}`}
                      >
                        <div className="grid gap-3 p-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                          <div>
                            {previewUrls[item.postId] ? (
                              <video
                                src={previewUrls[item.postId]}
                                muted
                                controls
                                preload="metadata"
                                onLoadedMetadata={() => setPreviewErrorIds((current) => {
                                  if (!current.has(item.postId)) return current;
                                  const next = new Set(current);
                                  next.delete(item.postId);
                                  return next;
                                })}
                                onError={() => setPreviewErrorIds((current) => new Set(current).add(item.postId))}
                                className="aspect-video w-full rounded-lg bg-black object-contain"
                                aria-label={`動画${index + 1}のプレビュー`}
                              />
                            ) : (
                              <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-black text-xs text-gray-500">
                                {previewErrorIds.has(item.postId) ? '動画を確認できません' : '動画を確認中…'}
                              </div>
                            )}
                          </div>
                          <div className="flex min-w-0 flex-col">
                            <div className="flex items-start gap-2">
                              <GripVertical className="mt-0.5 shrink-0 cursor-grab text-gray-600" size={18} />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-black text-cyan-300">動画 {index + 1}</p>
                                <p className="mt-1 truncate text-xs text-gray-500" title={item.postId}>{item.postId}</p>
                                {previewErrorIds.has(item.postId) && (
                                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-700/50 bg-amber-950/20 px-2.5 py-2 text-[11px] leading-5 text-amber-100">
                                    <AlertTriangle className="mt-0.5 shrink-0 text-amber-400" size={14} />
                                    <p>
                                      公開動画を確認できません。
                                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-bold text-amber-300 underline decoration-amber-500/70 underline-offset-2 transition hover:text-amber-200">
                                        Grokの個別ページを開き
                                      </a>
                                      、シェア済みか確認してから、もう一度追加してください。
                                    </p>
                                  </div>
                                )}
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <button type="button" onClick={() => moveVideo(index, -1)} disabled={isBusy || index === 0} className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-700 hover:text-white disabled:opacity-20" aria-label={`${index + 1}番を上へ移動`}><ArrowUp size={16} /></button>
                                <button type="button" onClick={() => moveVideo(index, 1)} disabled={isBusy || index === grokItems.length - 1} className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-700 hover:text-white disabled:opacity-20" aria-label={`${index + 1}番を下へ移動`}><ArrowDown size={16} /></button>
                                <button type="button" onClick={() => removeVideo(item.postId)} disabled={isBusy} className="rounded-md p-1.5 text-gray-500 transition hover:bg-red-950 hover:text-red-300" aria-label={`動画${index + 1}を削除`}><Trash2 size={16} /></button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-5 lg:sticky lg:top-5 lg:self-start">
            <section className="rounded-xl border border-gray-700 bg-[#222] p-4 shadow-lg shadow-black/10 sm:p-5">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-sm font-black text-white">3</div>
                <div>
                  <h2 className="font-bold text-white">結合して保存</h2>
                  <p className="mt-1 text-xs text-gray-400">まず無劣化の高速結合を行います。</p>
                </div>
              </div>

              <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-[#191919] p-2.5"><p className="text-lg font-black text-white">{grokItems.length}</p><p className="text-[10px] text-gray-500">動画数</p></div>
                <div className="rounded-lg bg-[#191919] p-2.5"><p className="text-sm font-black text-white">{formatDuration(totalDuration)}</p><p className="text-[10px] text-gray-500">合計時間</p></div>
                <div className="rounded-lg bg-[#191919] p-2.5"><p className="text-sm font-black text-white">{formatBytes(totalBytes)}</p><p className="text-[10px] text-gray-500">合計容量</p></div>
              </div>

              <div className={`mb-4 rounded-lg border p-3 text-xs leading-5 ${phase === 'error' ? 'border-red-500/40 bg-red-950/30 text-red-200' : phase === 'ready' ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200' : 'border-gray-700 bg-[#191919] text-gray-300'}`} aria-live="polite">
                <div className="flex items-start gap-2">
                  {isBusy && <LoaderCircle className="mt-0.5 shrink-0 animate-spin text-cyan-400" size={15} />}
                  {phase === 'ready' && <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-400" size={15} />}
                  {phase === 'error' && <AlertTriangle className="mt-0.5 shrink-0 text-red-400" size={15} />}
                  {!isBusy && phase !== 'ready' && phase !== 'error' && <ListVideo className="mt-0.5 shrink-0 text-gray-500" size={15} />}
                  <span>{statusMessage}</span>
                </div>
                {(isBusy || phase === 'ready') && (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/40">
                    <div className="h-full rounded-full bg-cyan-500 transition-[width] duration-300" style={{ width: `${progress}%` }} />
                  </div>
                )}
              </div>

              {errorMessage && (
                <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs leading-5 text-amber-200">{errorMessage}</p>
              )}

              {output && (
                <a
                  href={output.url}
                  download={output.fileName}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-emerald-950/40 transition hover:bg-emerald-500"
                >
                  <Download size={18} /> 完成MP4を保存（{formatBytes(output.size)}）
                </a>
              )}

              {output && (
                <p className="mt-2 text-center text-[10px] text-gray-500">{output.mode === 'copy' ? '高速結合・再エンコードなし' : '互換MP4へ変換して結合'}</p>
              )}

              <button
                type="button"
                onClick={() => void joinVideos()}
                disabled={grokItems.length < 2 || isBusy}
                className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500 disabled:shadow-none ${output ? 'mt-3 border border-gray-600 text-gray-300 hover:border-gray-400 hover:text-white' : 'bg-cyan-600 text-white shadow-lg shadow-cyan-950/40 hover:bg-cyan-500'}`}
              >
                {isBusy ? <LoaderCircle className="animate-spin" size={18} /> : output ? <RotateCcw size={18} /> : <Combine size={18} />}
                {isBusy ? '取得・結合中' : output ? 'もう一度結合する' : '動画を取得して結合'}
              </button>

              <button
                type="button"
                onClick={clearSession}
                disabled={isBusy || (videos.length === 0 && grokItems.length === 0)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-700 px-4 py-2.5 text-xs font-bold text-gray-400 transition hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                <RotateCcw size={15} /> このセッションを消去
              </button>
            </section>

            <section className="rounded-xl border border-gray-800 bg-[#1d1d1d] p-4 text-xs leading-5 text-gray-400">
              <h2 className="mb-3 flex items-center gap-2 font-bold text-gray-200"><HardDriveDownload size={16} className="text-cyan-400" /> 容量と待ち時間</h2>
              <ul className="space-y-2">
                <li>・FFmpeg処理エンジンは初回実行時に約32MB。通常はブラウザにキャッシュされます。</li>
                <li>・同形式なら短尺動画は数秒〜数十秒。互換変換が必要な場合は数分かかることがあります。</li>
                <li>・処理中はページを閉じず、PCのスリープを避けてください。</li>
              </ul>
            </section>
          </aside>
        </div>

        <section className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4 text-xs leading-6 text-gray-400 sm:p-5">
          <h2 className="flex items-center gap-2 font-bold text-emerald-200"><ShieldCheck size={17} /> プライバシーについて</h2>
          <p className="mt-2">Grok URLの確認にはGrok Share Boardの解決APIを利用します。新形式動画はGrokの公開CDNから直接取得し、旧形式動画だけ中継サーバーを通過します。中継サーバーは動画を保存・加工・キャッシュせず、結合処理と完成動画の生成はブラウザの一時メモリ内で行います。</p>
        </section>
      </main>

      {isGuideOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="video-join-guide-title"
          onClick={() => setIsGuideOpen(false)}
        >
          <div className="relative max-h-full w-full max-w-5xl overflow-auto rounded-2xl border border-cyan-300/30 bg-[#111] p-2 shadow-2xl shadow-cyan-950/40 sm:p-3" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-2 py-2">
              <h2 id="video-join-guide-title" className="text-sm font-black text-white sm:text-base">Grok Video Join — 3ステップの使い方</h2>
              <button type="button" onClick={() => setIsGuideOpen(false)} className="rounded-lg p-2 text-gray-400 transition hover:bg-white/10 hover:text-white" aria-label="使い方を閉じる">
                <X size={20} />
              </button>
            </div>
            <Image src={videoJoinGuide} alt="URLを貼る、順番を並べる、結合して保存する、Grok動画結合の3ステップ" className="h-auto w-full rounded-xl" priority />
          </div>
        </div>
      )}
    </div>
  );
}
