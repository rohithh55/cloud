-- Portfolio schema for Cloudflare D1 (SQLite). Arrays are stored as JSON text.
CREATE TABLE profile (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL, title TEXT NOT NULL, headline TEXT NOT NULL, summary TEXT NOT NULL,
  about TEXT NOT NULL DEFAULT '[]',
  email TEXT NOT NULL, phone TEXT NOT NULL, location TEXT NOT NULL,
  linkedin TEXT, github TEXT, website TEXT, live_project TEXT, availability TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE experiences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company TEXT NOT NULL, role TEXT NOT NULL, location TEXT,
  start_date TEXT NOT NULL, end_date TEXT, is_current INTEGER NOT NULL DEFAULT 0,
  bullets TEXT NOT NULL DEFAULT '[]', tags TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, description TEXT NOT NULL,
  bullets TEXT NOT NULL DEFAULT '[]', tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'Completed', live_url TEXT, repo_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE skill_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL, icon TEXT, items TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE education (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  degree TEXT NOT NULL, institution TEXT, graduation_year INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE certifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'In Progress', issuer TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Files (resume etc.) live in D1: metadata in `files`, bytes as base64 text slices in `file_chunks`.
CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'DOCUMENT',      -- RESUME | CERTIFICATE | DOCUMENT | IMAGE
  filename TEXT NOT NULL, mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_files_kind_active ON files(kind, is_active);

CREATE TABLE file_chunks (
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (file_id, idx)
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, email TEXT NOT NULL, subject TEXT, message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0, ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_messages_created ON messages(created_at);

CREATE TABLE visitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_uuid TEXT NOT NULL UNIQUE, ip_address TEXT,
  browser TEXT, device TEXT, os TEXT, country TEXT, city TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE page_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id INTEGER NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  page_name TEXT NOT NULL, time_spent INTEGER, click_count INTEGER DEFAULT 0, referrer TEXT,
  visited_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_page_visits_page ON page_visits(page_name);

CREATE TABLE downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id INTEGER REFERENCES visitors(id) ON DELETE CASCADE,
  file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  download_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
