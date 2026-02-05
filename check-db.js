const initSqlJs = require('sql.js');
const fs = require('fs');

initSqlJs().then(SQL => {
  const Database = SQL.Database || SQL.PhotoDatabase;
  const db = new Database(fs.readFileSync('./data/photo-mind.db'));

  // Check taken_at values
  const takenAt = db.exec(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN taken_at IS NULL OR taken_at = '' THEN 1 ELSE 0 END) as null_taken_at,
      MIN(taken_at) as earliest,
      MAX(taken_at) as latest
    FROM photos
  `);
  console.log('taken_at analysis:', JSON.stringify(takenAt[0]?.values, null, 2));

  // Check what query returns
  const limitQuery = db.exec(`SELECT * FROM photos ORDER BY taken_at DESC LIMIT 12 OFFSET 0`);
  console.log('LIMIT query results:', limitQuery[0]?.values?.length || 0);

  // Try without ORDER BY
  const noOrder = db.exec(`SELECT * FROM photos LIMIT 12`);
  console.log('No ORDER BY results:', noOrder[0]?.values?.length || 0);

  // Check if taken_at has invalid values
  const sample = db.exec(`SELECT id, file_name, taken_at FROM photos LIMIT 3`);
  console.log('Sample data:', JSON.stringify(sample[0]?.values, null, 2));

  db.close();
}).catch(e => console.error('Error:', e.message));
