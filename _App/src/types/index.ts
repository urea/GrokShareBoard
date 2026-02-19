
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
    clicks: number | null;
    nsfw: boolean;
    comment_count: number;
    last_comment_at: string | null;
    created_at: string;
}

export interface Comment {
    id: string;
    post_id: string;
    content: string;
    client_id: string;
    created_at: string;
}
