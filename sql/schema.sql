CREATE DATABASE IF NOT EXISTS matching_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE matching_db;

CREATE TABLE IF NOT EXISTS events (
  event_id INT AUTO_INCREMENT PRIMARY KEY,
  event_name VARCHAR(150) NOT NULL,
  event_date DATE NOT NULL,
  venue VARCHAR(150) NOT NULL,
  give_take_grams INT NOT NULL DEFAULT 30,
  cock_min_weight INT NOT NULL DEFAULT 1800,
  cock_max_weight INT NOT NULL DEFAULT 2600,
  stag_min_weight INT NOT NULL DEFAULT 1600,
  stag_max_weight INT NOT NULL DEFAULT 2300,
  bullstag_min_weight INT NOT NULL DEFAULT 1700,
  bullstag_max_weight INT NOT NULL DEFAULT 2400,
  allow_cock TINYINT(1) NOT NULL DEFAULT 1,
  allow_stag TINYINT(1) NOT NULL DEFAULT 1,
  allow_bullstag TINYINT(1) NOT NULL DEFAULT 1,
  status ENUM('draft','open','closed','done','cancelled') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS owners (
  owner_id INT AUTO_INCREMENT PRIMARY KEY,
  owner_name VARCHAR(150) NOT NULL,
  UNIQUE KEY owners_owner_name_unique (owner_name)
);

CREATE TABLE IF NOT EXISTS owner_no_fights (
  no_fight_id INT AUTO_INCREMENT PRIMARY KEY,
  owner_a_id INT NOT NULL,
  owner_b_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT owner_no_fights_owner_a_fk FOREIGN KEY (owner_a_id) REFERENCES owners(owner_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT owner_no_fights_owner_b_fk FOREIGN KEY (owner_b_id) REFERENCES owners(owner_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  UNIQUE KEY owner_no_fights_pair_unique (owner_a_id, owner_b_id),
  KEY owner_no_fights_owner_b_idx (owner_b_id)
);

CREATE TABLE IF NOT EXISTS entries (
  entry_id INT AUTO_INCREMENT PRIMARY KEY,
  owner_id INT NOT NULL,
  entry_name VARCHAR(255) NOT NULL,
  event_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT entries_owner_id_fk FOREIGN KEY (owner_id) REFERENCES owners(owner_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT entries_event_id_fk FOREIGN KEY (event_id) REFERENCES events(event_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  KEY entries_event_id_idx (event_id),
  KEY entries_owner_id_idx (owner_id)
);

CREATE TABLE IF NOT EXISTS entry_data (
  chicken_id INT AUTO_INCREMENT PRIMARY KEY,
  entry_id INT NOT NULL,
  entry_no INT NOT NULL,
  type ENUM('cock','stag','bullstag') NOT NULL,
  weight INT NOT NULL,
  wingband VARCHAR(80) NOT NULL,
  legband VARCHAR(80) NOT NULL,
  status ENUM('available','matched','fought','cancelled') NOT NULL DEFAULT 'available',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT entry_data_entry_id_fk FOREIGN KEY (entry_id) REFERENCES entries(entry_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  UNIQUE KEY entry_data_entry_no_unique (entry_id, entry_no),
  KEY entry_data_status_idx (status),
  KEY entry_data_type_weight_idx (type, weight)
);

CREATE TABLE IF NOT EXISTS matches (
  match_id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  fight_no INT NOT NULL,
  meron_chicken_id INT NOT NULL,
  wala_chicken_id INT NOT NULL,
  meron_weight INT NOT NULL,
  wala_weight INT NOT NULL,
  weight_difference INT NOT NULL,
  status ENUM('pending','confirmed','done','cancelled') NOT NULL DEFAULT 'confirmed',
  result ENUM('pending','meron','wala','draw') NOT NULL DEFAULT 'pending',
  meron_score DECIMAL(3,1) NULL,
  wala_score DECIMAL(3,1) NULL,
  active_tv TINYINT(1) NOT NULL DEFAULT 0,
  tv_meron_chicken_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT matches_event_id_fk FOREIGN KEY (event_id) REFERENCES events(event_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT matches_meron_chicken_id_fk FOREIGN KEY (meron_chicken_id) REFERENCES entry_data(chicken_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT matches_wala_chicken_id_fk FOREIGN KEY (wala_chicken_id) REFERENCES entry_data(chicken_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  UNIQUE KEY matches_event_fight_unique (event_id, fight_no),
  KEY matches_status_idx (status)
);

CREATE TABLE IF NOT EXISTS override_logs (
  override_log_id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  override_type ENUM('weight', 'mixed_type', 'both') NOT NULL,
  meron_chicken_id INT NOT NULL,
  wala_chicken_id INT NOT NULL,
  meron_owner_name VARCHAR(150) NOT NULL,
  wala_owner_name VARCHAR(150) NOT NULL,
  meron_weight INT NOT NULL,
  wala_weight INT NOT NULL,
  weight_difference INT NOT NULL,
  meron_type ENUM('cock', 'stag', 'bullstag') NOT NULL,
  wala_type ENUM('cock', 'stag', 'bullstag') NOT NULL,
  give_take_grams INT NOT NULL,
  session_id VARCHAR(128) NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT override_logs_event_id_fk FOREIGN KEY (event_id) REFERENCES events(event_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  KEY override_logs_event_id_idx (event_id),
  KEY override_logs_created_at_idx (created_at)
);
