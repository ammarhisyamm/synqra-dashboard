ALTER TABLE users ADD COLUMN username TEXT;

UPDATE users
SET username = lower(substr(email, 1, instr(email, '@') - 1))
WHERE username IS NULL OR username = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE);

UPDATE users
SET username = 'hisyam', password_hash = 'huUBLqyGVvyvpXghUXMhig==.d9q1ZpFA3N6vYKeg9en13NiBplHDWdzBvoCgW5G7kU0='
WHERE email = 'ammarhisyam151@gmail.com';

INSERT INTO users (id, email, username, name, password_hash, role)
VALUES ('user-erlangga', 'erlangga@synqra.local', 'erlangga', 'erlangga', 'd0jcbn+l9egoHzGVn9ujhg==.N+BJ0ODD41sqW63VbzE2fQg+Bam2M95m3TmWHV5IJQA=', 'member')
ON CONFLICT(email) DO UPDATE SET username = excluded.username, name = excluded.name, password_hash = excluded.password_hash;
