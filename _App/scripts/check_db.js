
const db = require('better-sqlite3')('../_Data/grokshare.db');
const rows = db.prepare('SELECT video_url FROM posts LIMIT 5').all();
console.log(rows);
