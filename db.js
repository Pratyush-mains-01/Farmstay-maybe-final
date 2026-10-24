const Database = require('better-sqlite3');
const db = new Database('farmstay.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, email TEXT, phone TEXT, guests TEXT,
    occasion TEXT, checkIn TEXT, checkOut TEXT,
    timeSlot TEXT, requests TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, email TEXT, stars INTEGER, text TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, email TEXT, phone TEXT, subject TEXT, message TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE
  );
`);

module.exports = db;