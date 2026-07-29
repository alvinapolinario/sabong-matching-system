USE matching_db;

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
