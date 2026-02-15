
export interface Post {
    id: string;
    url: string;
    prompt: string | null;
    user_id: string | null;
    video_url: string | null;
    image_url: string | null;
    width: number | null;
    height: number | null;
    site_name: string | null;
    title: string | null;
    created_at: string;
}
