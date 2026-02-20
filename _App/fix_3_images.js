const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envLocal = fs.readFileSync('.env.local', 'utf8');
const urlMatch = envLocal.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envLocal.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

if (!urlMatch || !keyMatch) {
    console.error('Environment variables not found');
    process.exit(1);
}

const supabaseUrl = urlMatch[1].trim();
const supabaseKey = keyMatch[1].trim();
const supabase = createClient(supabaseUrl, supabaseKey);

async function fix() {
    const uuids = [
        '22460adb-aa2b-421f-8b7a-ba3cba8703af',
        'caccd806-fa48-4c66-9882-deb292e34d77',
        'cbe61ae4-d8ec-407f-b838-84944685ce38'
    ];

    for (const uuid of uuids) {
        const url = `https://grok.com/imagine/post/${uuid}`;
        const imageUrl = `https://imagine-public.x.ai/imagine-public/share-images/${uuid}.jpg`;

        // Static images do not have video
        const { error } = await supabase.from('posts').update({
            image_url: imageUrl,
            video_url: ''
        }).eq('url', url);

        if (error) {
            console.error('Error updating', uuid, error);
        } else {
            console.log('Fixed:', uuid);
        }
    }
}

fix();
