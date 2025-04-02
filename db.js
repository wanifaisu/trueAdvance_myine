const mysql = require("mysql2");
require("dotenv").config();

console.log(
  process.env.DB_HOST,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  process.env.DB_DATABASE,
  "process.env.DB_DATABASE"
);
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  connectionLimit: 20,
  queueLimit: 0,
  waitForConnections: true,
});
pool.getConnection((err, connection) => {
  if (err) {
    console.error("❌ Error connecting to MySQL:", err);
  } else {
    console.log("✅ Connected to MySQL database");
    connection.release();
  }
});
module.exports = pool.promise();
