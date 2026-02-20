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

async function migrateIds() {
    console.log('--- Starting ID Migration Phase 2 ---');

    const { data: posts, error: fetchError } = await supabase.from('posts').select('*');
    if (fetchError) {
        console.error('Error fetching posts:', fetchError);
        return;
    }

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const post of posts) {
        const uuidMatch = post.url.match(/post\/([a-f0-9-]{36})/);
        // Handle temporary bypassed URLs from previous aborted run
        if (!uuidMatch && !post.url.startsWith('TEMP_MIGRATE_')) {
            console.warn(`[Skip] No valid UUID found in URL: ${post.url}`);
            skipCount++;
            continue;
        }

        let grokUuid = post.id;
        if (uuidMatch) {
            grokUuid = uuidMatch[1];
        }

        if (post.id === grokUuid) {
            console.log(`[Skip] ID is already Grok UUID: ${post.id}`);
            skipCount++;
            continue;
        }

        console.log(`Migrating: ${post.id} -> ${grokUuid}`);

        // STEP 1: Bypass UNIQUE constraint by updating old post URL to something temporary
        const tempUrl = `TEMP_MIGRATE_${post.id}`;
        await supabase.from('posts').update({ url: tempUrl }).eq('id', post.id);

        // STEP 2: INSERT new post with REAL URL and GROK UUID
        // Restore actual URL if it was already temped
        let actualUrl = post.url;
        if (actualUrl.startsWith('TEMP_MIGRATE_')) {
            actualUrl = `https://grok.com/imagine/post/${grokUuid}`;
        }

        const { search_tsv, ...postData } = post;
        const newPost = { ...postData, id: grokUuid, url: actualUrl };

        const { error: insertError } = await supabase.from('posts').insert(newPost);
        if (insertError) {
            console.error(`[Error] Failed to insert new post ${grokUuid}:`, insertError);
            // Revert the URL
            await supabase.from('posts').update({ url: actualUrl }).eq('id', post.id);
            errorCount++;
            continue;
        }

        // STEP 3: Transfer Comments
        const { error: updateCommentsError } = await supabase
            .from('comments')
            .update({ post_id: grokUuid })
            .eq('post_id', post.id);

        if (updateCommentsError) {
            console.error(`[Error] Failed to update comments for ${post.id}:`, updateCommentsError);
        }

        // STEP 4: Delete Old Post
        const { error: deleteError } = await supabase
            .from('posts')
            .delete()
            .eq('id', post.id);

        if (deleteError) {
            console.error(`[Error] Failed to delete old post ${post.id}:`, deleteError);
            errorCount++;
        } else {
            console.log(`[Success] Migrated to ${grokUuid}`);
            successCount++;
        }
    }

    console.log('--- Migration Complete ---');
    console.log(`Success: ${successCount}`);
    console.log(`Skipped: ${skipCount}`);
    console.log(`Errors: ${errorCount}`);
}

migrateIds();
