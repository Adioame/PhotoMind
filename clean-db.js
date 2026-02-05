const initSqlJs = require('sql.js');
const fs = require('fs');

initSqlJs().then(SQL => {
  const Database = SQL.Database || SQL.PhotoDatabase;
  const db = new Database(fs.readFileSync('./data/photo-mind.db'));

  // Delete duplicates, keeping only the latest entry (highest id)
  const result = db.exec(`
    DELETE FROM photos
    WHERE id NOT IN (
      SELECT MAX(id) FROM photos GROUP BY file_path
    )
  `);
  console.log('Deleted duplicate entries');

  // Get new count
  const count = db.exec('SELECT COUNT(*) as total FROM photos');
  console.log('New total photos:', count[0]?.values[0]?.[0]);

  // Save cleaned database
  const data = db.export();
  fs.writeFileSync('./data/photo-mind.db', Buffer.from(data));
  console.log('Database cleaned and saved');

  db.close();
}).catch(e => console.error('Error:', e.message));
