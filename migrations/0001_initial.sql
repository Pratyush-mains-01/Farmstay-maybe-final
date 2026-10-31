CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  ref TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL,
  source TEXT,
  createdAt TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  guests INTEGER NOT NULL,
  roomId TEXT NOT NULL,
  checkIn TEXT NOT NULL,
  checkOut TEXT NOT NULL,
  nights INTEGER NOT NULL,
  occasion TEXT,
  timeSlot TEXT,
  requests TEXT,
  note TEXT,
  confirmedAt TEXT
);

CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY,
  roomId TEXT NOT NULL,
  "from" TEXT NOT NULL,
  "to" TEXT NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  stars INTEGER NOT NULL,
  text TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT,
  message TEXT NOT NULL,
  done INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  minNights INTEGER NOT NULL,
  maxNights INTEGER NOT NULL,
  advanceDays INTEGER NOT NULL,
  note TEXT,
  closed TEXT
);