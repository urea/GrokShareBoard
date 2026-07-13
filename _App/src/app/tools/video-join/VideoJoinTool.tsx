'use client';

import Link from 'next/link';
import type { ChangeEvent, DragEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { buildGrokPublicVideoUrl, extractGrokPostId } from '@/lib/grokMedia';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Clapperboard,
  Combine,
  Cpu,
  Download,
  FolderOpen,
  GripVertical,
  HardDriveDownload,
  ListVideo,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from 'lucide-react';

const MAX_FILES = 10;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
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

interface ReadableFileHandle {
  kind: 'file';
  getFile(): Promise<File>;
}

interface ReadableDirectoryHandle {
  name: string;
  values(): AsyncIterableIterator<ReadableFileHandle | { kind: 'directory' }>;
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: 'read';
    startIn?: 'downloads';
  }) => Promise<ReadableDirectoryHandle>;
}

interface JoinOutput {
  url: string;
  fileName: string;
  size: number;
  mode: 'copy' | 'transcode';
}

type ProcessingPhase =
  | 'idle'
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

function isMp4(file: File) {
  return file.type === 'video/mp4' || file.name.toLowerCase().endsWith('.mp4');
}

function extractPostIdFromFileName(fileName: string) {
  return fileName.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i)?.[1].toLowerCase() ?? null;
}

export function VideoJoinTool() {
  const [grokUrlText, setGrokUrlText] = useState('');
  const [grokItems, setGrokItems] = useState<GrokVideoItem[]>([]);
  const [videos, setVideos] = useState<LocalVideo[]>([]);
  const [phase, setPhase] = useState<ProcessingPhase>('idle');
  const [statusMessage, setStatusMessage] = useState('MP4を2本以上選択すると結合できます。');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUrlDragging, setIsUrlDragging] = useState(false);
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [directoryHandle, setDirectoryHandle] = useState<ReadableDirectoryHandle | null>(null);
  const [directoryMessage, setDirectoryMessage] = useState('');
  const [supportsDirectoryPicker, setSupportsDirectoryPicker] = useState(false);
  const [output, setOutput] = useState<JoinOutput | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const ffmpegAssetUrlsRef = useRef<string[]>([]);
  const outputUrlRef = useRef<string | null>(null);
  const grokUrlTextareaRef = useRef<HTMLTextAreaElement>(null);
  const scanDirectoryRef = useRef<() => Promise<void>>(async () => undefined);

  const totalBytes = useMemo(() => videos.reduce((sum, video) => sum + video.file.size, 0), [videos]);
  const totalDuration = useMemo(
    () => videos.reduce((sum, video) => sum + (video.duration ?? 0), 0),
    [videos],
  );
  const isBusy = phase === 'loading-engine' || phase === 'preparing' || phase === 'joining' || phase === 'transcoding';

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
    setSupportsDirectoryPicker('showDirectoryPicker' in window);
    const savedUrls = sessionStorage.getItem(GROK_URL_SESSION_KEY);
    if (!savedUrls) return;
    const parsed = parseGrokUrls(savedUrls);
    const frameId = requestAnimationFrame(() => setGrokItems(parsed.valid.map((url) => ({ url, postId: extractGrokPostId(url)! }))));
    return () => cancelAnimationFrame(frameId);
  }, []);

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
    setErrorMessage(parsed.invalidCount > 0 ? `認識できない入力を${parsed.invalidCount}件除外しました。` : '');
    setGrokItems((current) => {
      const known = new Set(current.map((item) => item.postId));
      const additions = parsed.valid
        .map((url) => ({ url, postId: extractGrokPostId(url)! }))
        .filter((item) => !known.has(item.postId));
      const next = [...current, ...additions].slice(0, MAX_FILES);
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

  const addFiles = async (incoming: File[]) => {
    if (isBusy || incoming.length === 0) return;
    setErrorMessage('');
    releaseOutput();

    const unsupported = incoming.filter((file) => !isMp4(file));
    const mp4Files = incoming.filter(isMp4);
    if (unsupported.length > 0) {
      setErrorMessage('MP4以外のファイルは追加しませんでした。GrokからMP4形式で保存してください。');
    }
    if (mp4Files.length === 0) return;

    const recognizedFileMap = new Map<string, File>();
    mp4Files.forEach((file) => {
      const postId = extractPostIdFromFileName(file.name);
      if (postId && grokItems.some((item) => item.postId === postId)) recognizedFileMap.set(postId, file);
    });
    const recognizedFiles = Array.from(recognizedFileMap, ([postId, file]) => ({ postId, file }));
    if (recognizedFiles.length === 0) {
      setErrorMessage('URLカードと同じUUIDを含むMP4がありませんでした。UUID (1).mp4のような名前にも対応しています。');
      return;
    }

    const replacementIds = new Set(recognizedFiles.map(({ postId }) => postId));
    const retainedBytes = videos.filter((video) => !replacementIds.has(video.postId)).reduce((sum, video) => sum + video.file.size, 0);
    const nextTotalBytes = retainedBytes + recognizedFiles.reduce((sum, { file }) => sum + file.size, 0);
    if (nextTotalBytes > MAX_TOTAL_BYTES) {
      setErrorMessage(`合計${formatBytes(MAX_TOTAL_BYTES)}までにしてください。現在の選択に追加すると${formatBytes(nextTotalBytes)}です。`);
      return;
    }

    setStatusMessage('動画情報を確認しています…');
    const additions = await Promise.all(recognizedFiles.map(async ({ file, postId }) => {
      const metadata = await readVideoMetadata(file);
      return {
        id: postId,
        postId,
        file,
        ...metadata,
      };
    }));

    setVideos((current) => {
      const byPostId = new Map(current.map((video) => [video.postId, video]));
      additions.forEach((video) => byPostId.set(video.postId, video));
      return grokItems.flatMap((item) => {
        const video = byPostId.get(item.postId);
        return video ? [video] : [];
      });
    });
    setStatusMessage('UUIDで動画を割り当てました。未選択のカードがないか確認してください。');
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    void addFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  const scanDownloadDirectory = async (handle = directoryHandle) => {
    if (!handle || isBusy || grokItems.length === 0) return;
    const newestByPostId = new Map<string, File>();
    for await (const entry of handle.values()) {
      if (entry.kind !== 'file') continue;
      const file = await entry.getFile();
      if (!isMp4(file)) continue;
      const postId = extractPostIdFromFileName(file.name);
      if (!postId || !grokItems.some((item) => item.postId === postId)) continue;
      const previous = newestByPostId.get(postId);
      if (!previous || file.lastModified >= previous.lastModified) newestByPostId.set(postId, file);
    }
    const files = Array.from(newestByPostId.values());
    const changedFiles = files.filter((file) => {
      const postId = extractPostIdFromFileName(file.name);
      const current = videos.find((video) => video.postId === postId)?.file;
      return !current || current.size !== file.size || current.lastModified !== file.lastModified;
    });
    if (changedFiles.length > 0) {
      await addFiles(changedFiles);
      setDirectoryMessage(`${files.length}件のMP4をUUIDで確認しました。`);
    } else if (files.length > 0) {
      setDirectoryMessage(`${files.length}件のMP4を自動検出済みです。`);
    } else {
      setDirectoryMessage('一致するMP4はまだありません。保存後に自動検出します。');
    }
  };

  scanDirectoryRef.current = () => scanDownloadDirectory();

  const connectDownloadDirectory = async () => {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) return;
    try {
      const handle = await picker({ id: 'grok-video-join-downloads', mode: 'read', startIn: 'downloads' });
      setDirectoryHandle(handle);
      setDirectoryMessage(`${handle.name} を読み取り専用で接続しました。`);
      await scanDownloadDirectory(handle);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setDirectoryMessage('フォルダへ接続できませんでした。MP4の選択またはD&Dを利用してください。');
    }
  };

  useEffect(() => {
    if (!directoryHandle || isBusy) return;
    const intervalId = window.setInterval(() => void scanDirectoryRef.current(), 2500);
    return () => window.clearInterval(intervalId);
  }, [directoryHandle, isBusy]);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void addFiles(Array.from(event.dataTransfer.files));
  };

  const reorderVideo = (index: number, destination: number) => {
    if (destination < 0 || destination >= grokItems.length || isBusy) return;
    releaseOutput();
    setGrokItems((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(destination, 0, item);
      persistGrokItems(next);
      setVideos((currentVideos) => {
        const byPostId = new Map(currentVideos.map((video) => [video.postId, video]));
        return next.flatMap((entry) => {
          const video = byPostId.get(entry.postId);
          return video ? [video] : [];
        });
      });
      return next;
    });
  };

  const moveVideo = (index: number, offset: -1 | 1) => reorderVideo(index, index + offset);

  const removeVideo = (postId: string) => {
    if (isBusy) return;
    releaseOutput();
    setVideos((current) => current.filter((video) => video.postId !== postId));
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
    setProgress(0);
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

  const joinVideos = async () => {
    if (videos.length < 2 || isBusy) return;

    releaseOutput();
    setErrorMessage('');
    setProgress(0);
    const inputPaths = videos.map((_, index) => `input-${index.toString().padStart(2, '0')}.mp4`);
    const normalizedPaths = videos.map((_, index) => `normalized-${index.toString().padStart(2, '0')}.mp4`);
    const listPath = 'join-list.txt';
    const normalizedListPath = 'normalized-list.txt';
    const outputPath = 'joined-output.mp4';
    let ffmpeg: FFmpeg | null = null;

    try {
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
        for (let index = 0; index < videos.length; index += 1) {
          setStatusMessage(`動画をブラウザ内の作業領域へ準備しています（${index + 1}/${videos.length}）…`);
          await ffmpeg.writeFile(inputPaths[index], await fetchFile(videos[index].file));
          setProgress(Math.round(((index + 1) / videos.length) * 25));
        }
        await ffmpeg.writeFile(listPath, inputPaths.map((path) => `file '${path}'`).join('\n'));

        setStatusMessage('動画形式の互換性を確認しています…');
        const audioPresence: boolean[] = [];
        for (let index = 0; index < inputPaths.length; index += 1) {
          audioPresence.push(await hasAudioStream(ffmpeg, inputPaths[index]));
        }
        const firstDimensions = `${videos[0].width ?? 'unknown'}x${videos[0].height ?? 'unknown'}`;
        const sameDimensions = videos.every((video) => `${video.width ?? 'unknown'}x${video.height ?? 'unknown'}` === firstDimensions);
        const sameAudioPresence = audioPresence.every((hasAudio) => hasAudio === audioPresence[0]);
        const canStreamCopy = sameDimensions && sameAudioPresence;

        let mode: JoinOutput['mode'] = 'copy';
        let result = 1;
        if (canStreamCopy) {
          setPhase('joining');
          setProgress(25);
          setStatusMessage('画質を変えずに高速結合しています…');
          progressBase = 25;
          progressRange = 70;
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
          setProgress(0);
          const targetWidth = Math.max(2, Math.floor((videos[0].width ?? 720) / 2) * 2);
          const targetHeight = Math.max(2, Math.floor((videos[0].height ?? 1280) / 2) * 2);
          const anyAudio = audioPresence.some(Boolean);

          for (let index = 0; index < inputPaths.length; index += 1) {
            setStatusMessage(`動画形式を揃えています（${index + 1}/${inputPaths.length}）。数分かかる場合があります…`);
            progressBase = Math.round((index / inputPaths.length) * 85);
            progressRange = 85 / inputPaths.length;
            const hasAudio = audioPresence[index];
            const duration = Math.max(0.1, videos[index].duration ?? 1);
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
              throw new Error(`${videos[index].file.name}を互換MP4へ変換できませんでした。`);
            }
          }

          await ffmpeg.writeFile(normalizedListPath, normalizedPaths.map((path) => `file '${path}'`).join('\n'));
          setStatusMessage('変換した動画を1本へまとめています…');
          progressBase = 85;
          progressRange = 14;
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
    setVideos([]);
    setDirectoryHandle(null);
    setDirectoryMessage('');
    setPhase('idle');
    setProgress(0);
    setErrorMessage('');
    setStatusMessage('MP4を2本以上選択すると結合できます。');
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

      <main className="mx-auto w-full max-w-6xl px-3 py-6 sm:px-5 sm:py-10">
        <section className="mb-6 overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-[#12303b] via-[#20252a] to-[#222] p-5 shadow-xl shadow-black/20 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100">
                <LockKeyhole size={14} /> LOCAL PROCESSING
              </div>
              <h1 className="text-2xl font-black tracking-tight text-white sm:text-4xl">Grok動画を、端末の中だけでつなぐ。</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-gray-300 sm:text-base">
                Grokから保存したMP4を選ぶと、入力順に1本へ結合します。動画はサーバーへ送信されず、このブラウザ内だけで処理されます。
              </p>
            </div>
            <div className="grid min-w-[230px] grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <ShieldCheck className="mb-2 text-emerald-400" size={20} />
                <p className="font-bold text-white">アップロードなし</p>
                <p className="mt-1 text-gray-400">動画は端末外へ送信しません</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <Cpu className="mb-2 text-cyan-400" size={20} />
                <p className="font-bold text-white">FFmpeg in Browser</p>
                <p className="mt-1 text-gray-400">初回実行時に約32MB</p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <section className="rounded-xl border border-gray-700 bg-[#222] p-4 shadow-lg shadow-black/10 sm:p-5">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-sm font-black text-white">1</div>
                <div>
                  <h2 className="font-bold text-white">Grok動画URLを追加</h2>
                  <p className="mt-1 text-xs leading-5 text-gray-400">リンクをドロップ、または複数URLを貼り付けて結合リストを作ります。</p>
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
                <textarea ref={grokUrlTextareaRef} value={grokUrlText} onChange={(event) => setGrokUrlText(event.target.value)} disabled={isBusy} rows={2} placeholder="またはGrok投稿URLを貼り付け" className="w-full resize-y rounded-lg border border-gray-600 bg-[#111] px-3 py-2.5 text-sm text-gray-100 outline-none placeholder:text-gray-600 focus:border-cyan-500" aria-label="Grok動画URL" />
                <button type="button" onClick={() => addGrokUrls(grokUrlTextareaRef.current?.value ?? '')} disabled={isBusy || !grokUrlText.trim()} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-cyan-500 disabled:opacity-40">
                  <Download size={16} /> 結合リストへ追加
                </button>
              </div>
            </section>

            <section className="rounded-xl border border-gray-700 bg-[#222] p-4 shadow-lg shadow-black/10 sm:p-5">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-sm font-black text-white">2</div>
                <div>
                  <h2 className="font-bold text-white">保存・並び替え・MP4割り当て</h2>
                  <p className="mt-1 text-xs leading-5 text-gray-400">各動画を保存後、MP4をまとめて選択してください。UUIDでカードへ自動割り当てします。</p>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,.mp4"
                multiple
                className="hidden"
                onChange={handleFileInput}
              />
              {grokItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-700 bg-[#191919] px-4 py-8 text-center text-sm text-gray-500">先にGrok動画URLを追加してください。</div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border border-cyan-700/50 bg-cyan-950/20 px-3 py-2.5 text-xs leading-5 text-cyan-100">
                    <span className="font-bold">PC：</span>「動画を保存」を右クリックして「名前を付けてリンク先を保存」。WindowsはAlt＋クリック、スマートフォンは長押しでも保存できます。
                  </div>
                  <div className="flex items-start gap-2 rounded-lg border border-amber-700/50 bg-amber-950/20 px-3 py-2.5 text-xs leading-5 text-amber-100">
                    <AlertTriangle className="mt-0.5 shrink-0 text-amber-400" size={15} />
                    <p>サムネイルが表示されない場合は、Grokの個別ページでシェアボタンを押してから、もう一度お試しください。</p>
                  </div>
                  {grokItems.map((item, index) => {
                    const localVideo = videos.find((video) => video.postId === item.postId);
                    return (
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
                          <video src={buildGrokPublicVideoUrl(item.postId)} muted controls preload="metadata" className="aspect-video w-full rounded-lg bg-black object-contain" aria-label={`動画${index + 1}のプレビュー`} />
                          <div className="flex min-w-0 flex-col">
                            <div className="flex items-start gap-2">
                              <GripVertical className="mt-1 shrink-0 text-gray-600" size={18} />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-black text-cyan-300">結合順 {index + 1}</p>
                                <p className="mt-1 truncate text-xs text-gray-500" title={item.postId}>{item.postId}</p>
                              </div>
                              <button type="button" onClick={() => removeVideo(item.postId)} disabled={isBusy} className="rounded-md p-1.5 text-gray-500 transition hover:bg-red-950 hover:text-red-300" aria-label={`動画${index + 1}を削除`}><Trash2 size={16} /></button>
                            </div>
                            <div className={`mt-3 rounded-md px-2.5 py-2 text-xs ${localVideo ? 'bg-emerald-950/40 text-emerald-300' : 'bg-amber-950/30 text-amber-300'}`}>
                              {localVideo ? `MP4選択済み · ${formatBytes(localVideo.file.size)} · ${formatDuration(localVideo.duration)}` : '未選択 · 動画を保存してMP4を割り当ててください'}
                            </div>
                            <div className="mt-auto flex flex-wrap justify-end gap-2 pt-3">
                              <button type="button" onClick={() => moveVideo(index, -1)} disabled={isBusy || index === 0} className="rounded-md border border-gray-700 p-2 text-gray-400 transition hover:text-white disabled:opacity-20" aria-label={`動画${index + 1}を上へ移動`}><ArrowUp size={15} /></button>
                              <button type="button" onClick={() => moveVideo(index, 1)} disabled={isBusy || index === grokItems.length - 1} className="rounded-md border border-gray-700 p-2 text-gray-400 transition hover:text-white disabled:opacity-20" aria-label={`動画${index + 1}を下へ移動`}><ArrowDown size={15} /></button>
                              <a href={buildGrokPublicVideoUrl(item.postId)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-cyan-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-cyan-500">
                                <Download size={14} /> 動画を保存
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {supportsDirectoryPicker && grokItems.length > 0 && (
                <div className="mt-4 rounded-xl border border-cyan-700/50 bg-cyan-950/20 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-bold text-cyan-100">ダウンロードフォルダを自動確認</p>
                      <p className="mt-1 text-xs leading-5 text-gray-400">最初に1回だけ読み取り許可すると、保存されたUUID.mp4を自動でカードへ割り当てます。</p>
                    </div>
                    <button type="button" onClick={() => void (directoryHandle ? scanDownloadDirectory() : connectDownloadDirectory())} disabled={isBusy} className="shrink-0 rounded-lg bg-cyan-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-cyan-500 disabled:opacity-40">
                      {directoryHandle ? 'フォルダを再確認' : 'フォルダを接続'}
                    </button>
                  </div>
                  {directoryMessage && <p className="mt-2 text-xs text-cyan-200" aria-live="polite">{directoryMessage}</p>}
                  <p className="mt-2 text-[10px] text-gray-500">読み取り専用です。ファイルの変更・削除やサーバー送信は行いません。</p>
                </div>
              )}
              <div
                onDragEnter={(event) => { event.preventDefault(); if (!isBusy) setIsDragging(true); }}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}
                onDragLeave={(event) => { if (event.currentTarget === event.target) setIsDragging(false); }}
                onDrop={handleDrop}
                className={`mt-4 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${isDragging ? 'border-emerald-400 bg-emerald-400/10' : 'border-gray-600 bg-[#191919] hover:border-gray-500'} ${isBusy || grokItems.length === 0 ? 'pointer-events-none opacity-40' : ''}`}
              >
                <FolderOpen className="mx-auto mb-3 text-emerald-400" size={30} />
                <p className="text-sm font-bold text-white">保存したMP4をまとめて選択</p>
                <p className="mt-1 text-xs text-gray-500">UUID (1).mp4なども同じカードへ上書きします</p>
                <p className="my-2 text-xs text-gray-500">または</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isBusy}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  MP4を選択
                </button>
              </div>
            </section>
          </div>

          <aside className="space-y-5 lg:sticky lg:top-5 lg:self-start">
            <section className="rounded-xl border border-gray-700 bg-[#222] p-4 shadow-lg shadow-black/10 sm:p-5">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-sm font-black text-white">3</div>
                <div>
                  <h2 className="font-bold text-white">結合して保存</h2>
                  <p className="mt-1 text-xs text-gray-400">まず無劣化の高速結合を試します。</p>
                </div>
              </div>

              <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-[#191919] p-2.5"><p className="text-lg font-black text-white">{videos.length}/{grokItems.length}</p><p className="text-[10px] text-gray-500">選択済み</p></div>
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

              <button
                type="button"
                onClick={() => void joinVideos()}
                disabled={videos.length < 2 || videos.length !== grokItems.length || isBusy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-cyan-950/40 transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500 disabled:shadow-none"
              >
                {isBusy ? <LoaderCircle className="animate-spin" size={18} /> : <Combine size={18} />}
                {isBusy ? 'ブラウザ内で処理中' : '動画を結合する'}
              </button>

              {output && (
                <a
                  href={output.url}
                  download={output.fileName}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-emerald-950/40 transition hover:bg-emerald-500"
                >
                  <Download size={18} /> 完成MP4を保存（{formatBytes(output.size)}）
                </a>
              )}

              {output && (
                <p className="mt-2 text-center text-[10px] text-gray-500">{output.mode === 'copy' ? '高速結合・再エンコードなし' : '互換MP4へ変換して結合'}</p>
              )}

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
          <p className="mt-2">選択した動画、Grok URL、完成動画をGrok Share Boardのサーバーや第三者ストレージへ送信しません。結合処理エンジンのみ固定バージョンのCDNから読み込み、動画処理はブラウザの一時メモリ内で行います。</p>
        </section>
      </main>
    </div>
  );
}
