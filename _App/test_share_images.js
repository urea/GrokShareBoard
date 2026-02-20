const https = require('https');

function checkUrl(url) {
    return new Promise((resolve) => {
        const req = https.request(url, { method: 'HEAD' }, (res) => {
            resolve(res.statusCode);
        });
        req.on('error', () => {
            resolve(0);
        });
        req.end();
    });
}

async function test() {
    const uuids = [
        '22460adb-aa2b-421f-8b7a-ba3cba8703af',
        'caccd806-fa48-4c66-9882-deb292e34d77',
        'cbe61ae4-d8ec-407f-b838-84944685ce38'
    ];

    for (const uuid of uuids) {
        console.log('Testing UUID:', uuid);
        const urls = [
            `https://imagine-public.x.ai/imagine-public/share-images/${uuid}.jpg`
        ];

        for (const url of urls) {
            const status = await checkUrl(url);
            console.log(`  ${status} - ${url}`);
        }
    }
}

test();
